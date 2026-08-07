/**
 * Permissionless settlement crank for agent-tickets-escrow.
 *
 * Every tick it pulls every Order account owned by the program and settles the
 * ones the two-clock state machine has already decided:
 *
 *   Locked    && now > delivery_deadline    -> timeout_refund   (buyer gets the money back)
 *   Delivered && now > inspection_deadline  -> timeout_release  (seller gets paid, fee skimmed)
 *
 * Neither instruction checks a signer identity, by design (see lib.rs §timeout_*).
 * Anyone can run this. We run one so the marketplace is never stuck waiting on a
 * human, but the escrow's liveness does not depend on us being up — which is the
 * whole point: this is the first agent-native surface in the product. Any bot with
 * a funded keypair can settle expired escrows and collect the rent it unlocks.
 *
 * Usage:
 *   npm run crank                      # loop forever, 60s interval
 *   npm run crank -- --once            # single pass, exit (cron / CI friendly)
 *   npm run crank -- --dry-run         # report what it would do, send nothing
 *
 * Env:
 *   RPC_URL          override the RPC endpoint (default: scripts/devnet-addresses.json)
 *   PROGRAM_ID       override the program id
 *   CRANK_KEYPAIR    fee-payer keypair path (default: ANCHOR_WALLET, then ~/.config/solana/id.json)
 *   CRANK_INTERVAL_MS  poll interval (default 60000)
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  isBenignRace,
  selectDue,
  type OrderAccount,
} from "./crank-core";
import { fileURLToPath } from "url";
import * as __p from "path";
const __dirname = __p.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(__dirname, "..");
const IDL_PATH = path.join(REPO_ROOT, "target", "idl", "agent_tickets_escrow.json");
const ADDRESSES_PATH = path.join(__dirname, "devnet-addresses.json");

const DEFAULT_INTERVAL_MS = 60_000;

interface ConfigAccount {
  authority: PublicKey;
  arbiter: PublicKey;
  feeBps: number;
  feeDestination: PublicKey;
  usdcMint: PublicKey;
  deliveryWindowSecs: anchor.BN;
  inspectionWindowSecs: anchor.BN;
  paused: boolean;
  bump: number;
}

// ---------- logging ----------

function log(msg: string, extra?: Record<string, unknown>) {
  const line = `[crank ${new Date().toISOString()}] ${msg}`;
  if (extra && Object.keys(extra).length > 0) {
    console.log(line, JSON.stringify(extra));
  } else {
    console.log(line);
  }
}

function logError(msg: string, extra?: Record<string, unknown>) {
  const line = `[crank ${new Date().toISOString()}] ERROR ${msg}`;
  if (extra && Object.keys(extra).length > 0) {
    console.error(line, JSON.stringify(extra));
  } else {
    console.error(line);
  }
}

// ---------- setup ----------

function loadKeypair(): Keypair {
  const candidates = [
    process.env.CRANK_KEYPAIR,
    process.env.ANCHOR_WALLET,
    path.join(os.homedir(), ".config", "solana", "id.json"),
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    const resolved = candidate.startsWith("~")
      ? path.join(os.homedir(), candidate.slice(1))
      : candidate;
    if (fs.existsSync(resolved)) {
      const bytes = Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf8")));
      return Keypair.fromSecretKey(bytes);
    }
  }
  throw new Error(
    `no crank keypair found (looked at: ${candidates.join(", ")}). Set CRANK_KEYPAIR.`
  );
}

function loadIdl(): anchor.Idl {
  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(
      `IDL not found at ${IDL_PATH}. Run \`anchor build\` first — the crank decodes ` +
        `Order accounts from it.`
    );
  }
  return JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as anchor.Idl;
}

function loadAddresses(): { rpcUrl: string; programId: string } {
  const raw = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
  return {
    rpcUrl: process.env.RPC_URL ?? raw.rpcUrl,
    programId: process.env.PROGRAM_ID ?? raw.programId,
  };
}

/**
 * Anchor 0.31 takes the program id from `idl.address`. The IDL is emitted with
 * whatever `declare_id!` said at build time, which is the placeholder until the
 * real deploy keypair exists — so devnet-addresses.json wins.
 */
function buildProgram(
  idl: anchor.Idl,
  programId: string,
  provider: anchor.AnchorProvider
): anchor.Program {
  const patched = { ...idl, address: programId } as anchor.Idl;
  return new anchor.Program(patched, provider);
}

// ---------- helpers ----------

/**
 * The program compares against the on-chain Clock, not our wall clock. Use the
 * cluster's block time so we never fire a tx a few seconds early and eat a
 * DeadlineNotReached. Falls back to local time if the RPC won't say.
 */
async function chainNow(connection: Connection): Promise<number> {
  try {
    const slot = await connection.getSlot("confirmed");
    const blockTime = await connection.getBlockTime(slot);
    if (blockTime !== null) return blockTime;
  } catch {
    /* fall through */
  }
  return Math.floor(Date.now() / 1000);
}

// ---------- the crank ----------

class Crank {
  private tokenProgramId: PublicKey | null = null;
  private config: ConfigAccount | null = null;
  private configPda: PublicKey;

  constructor(
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly dryRun: boolean
  ) {
    this.configPda = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )[0];
  }

  /** Config + the mint's owning token program are immutable enough to cache. */
  private async loadConfig(): Promise<ConfigAccount> {
    if (this.config && this.tokenProgramId) return this.config;

    const config = (await (this.program.account as any).config.fetch(
      this.configPda
    )) as ConfigAccount;

    const mintInfo = await this.connection.getAccountInfo(config.usdcMint);
    if (!mintInfo) throw new Error(`config.usdcMint ${config.usdcMint} has no account`);
    this.tokenProgramId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
    this.config = config;

    log("loaded config", {
      config: this.configPda.toBase58(),
      usdcMint: config.usdcMint.toBase58(),
      feeDestination: config.feeDestination.toBase58(),
      tokenProgram: this.tokenProgramId.toBase58(),
      paused: config.paused,
    });
    return config;
  }

  private ata(mint: PublicKey, owner: PublicKey, offCurve: boolean): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, offCurve, this.tokenProgramId!);
  }

  async tick(): Promise<void> {
    const config = await this.loadConfig();
    const now = await chainNow(this.connection);

    // Discriminator-filtered getProgramAccounts, via the IDL's account codec.
    const orders = (await (this.program.account as any).order.all()) as Array<{
      publicKey: PublicKey;
      account: OrderAccount;
    }>;

    const due = selectDue(orders, now);

    log(`scanned ${orders.length} order(s), ${due.length} due`, { chainNow: now });

    let settled = 0;
    let failed = 0;
    let skipped = 0;

    for (const { pubkey: publicKey, account, state, action } of due) {
      if (this.dryRun) {
        log(`DRY RUN would ${action}`, {
          order: publicKey.toBase58(),
          state,
          amount: account.amount.toString(),
        });
        continue;
      }

      try {
        const sig =
          action === "timeout_refund"
            ? await this.timeoutRefund(publicKey, account, config)
            : await this.timeoutRelease(publicKey, account, config);
        settled++;
        log(`${action} OK`, {
          order: publicKey.toBase58(),
          listing: account.listing.toBase58(),
          buyer: account.buyer.toBase58(),
          seller: account.seller.toBase58(),
          amount: account.amount.toString(),
          signature: sig,
        });
      } catch (err) {
        const benign = isBenignRace(err);
        if (benign) {
          skipped++;
          log(`${action} skipped (${benign})`, { order: publicKey.toBase58() });
        } else {
          failed++;
          logError(`${action} failed`, {
            order: publicKey.toBase58(),
            error: err instanceof Error ? err.message : String(err),
            logs: (err as { logs?: string[] }).logs,
          });
        }
      }
    }

    if (!this.dryRun && due.length > 0) {
      log(`tick complete: ${settled} settled, ${skipped} skipped, ${failed} failed`);
    }
  }

  /** Locked past delivery_deadline -> full refund to buyer, listing cancelled. */
  private async timeoutRefund(
    orderPda: PublicKey,
    order: OrderAccount,
    config: ConfigAccount
  ): Promise<string> {
    return await (this.program.methods as any)
      .timeoutRefund()
      .accounts({
        config: this.configPda,
        listing: order.listing,
        order: orderPda,
        buyer: order.buyer,
        seller: order.seller,
        vault: this.ata(config.usdcMint, orderPda, true),
        buyerToken: this.ata(config.usdcMint, order.buyer, false),
        usdcMint: config.usdcMint,
        tokenProgram: this.tokenProgramId!,
      })
      .rpc();
  }

  /**
   * Delivered past inspection_deadline -> pay the seller, skim the fee.
   * `authority` is only identity-checked in confirm_receipt; on this path it is
   * just the fee payer, which is why any bot can call it.
   */
  private async timeoutRelease(
    orderPda: PublicKey,
    order: OrderAccount,
    config: ConfigAccount
  ): Promise<string> {
    return await (this.program.methods as any)
      .timeoutRelease()
      .accounts({
        config: this.configPda,
        listing: order.listing,
        order: orderPda,
        authority: this.program.provider.publicKey,
        buyer: order.buyer,
        seller: order.seller,
        vault: this.ata(config.usdcMint, orderPda, true),
        sellerToken: this.ata(config.usdcMint, order.seller, false),
        feeToken: this.ata(config.usdcMint, config.feeDestination, false),
        usdcMint: config.usdcMint,
        tokenProgram: this.tokenProgramId!,
      })
      .rpc();
  }
}

// ---------- entrypoint ----------

async function main() {
  const argv = process.argv.slice(2);
  const once = argv.includes("--once");
  const dryRun = argv.includes("--dry-run");
  const intervalMs = Number(process.env.CRANK_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  const { rpcUrl, programId } = loadAddresses();
  const idl = loadIdl();
  const keypair = loadKeypair();

  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    { commitment: "confirmed" }
  );
  const program = buildProgram(idl, programId, provider);

  log("starting", {
    rpc: rpcUrl,
    programId: program.programId.toBase58(),
    payer: keypair.publicKey.toBase58(),
    intervalMs,
    mode: dryRun ? "dry-run" : once ? "once" : "loop",
  });

  const crank = new Crank(program, connection, dryRun);

  // A thrown tick must never kill the process — RPC flakes, the config account
  // not existing yet, a bad epoch: all of it is recoverable on the next tick.
  const runTick = async () => {
    try {
      await crank.tick();
    } catch (err) {
      logError("tick failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  await runTick();
  if (once) return;

  // Sequential, not setInterval: a slow tick must not overlap the next one and
  // double-submit the same settlement.
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    await runTick();
  }
}

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    log(`${signal} received, shutting down`);
    process.exit(0);
  });
}

main().catch((err) => {
  logError("fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
