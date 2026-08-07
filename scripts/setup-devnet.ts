/**
 * Devnet money plumbing for Agent-Tickets.
 *
 * Provisions the four team wallets, a 6-decimal test USDC mint, and 1,000 test
 * USDC in each wallet's ATA. Rerunnable: every step checks on-chain state first
 * and only does the work that is actually missing.
 *
 *   npm run setup:devnet
 *
 * Keypairs live OUTSIDE the repo at ~/.config/agent-tickets/wallets/<name>.json
 * (solana-cli compatible byte arrays). Public addresses are written to
 * scripts/devnet-addresses.json, which is safe to commit.
 *
 * Design doc §5.6: the mint is config, never a constant, and all amounts are
 * base units — the classic demo bug is a 10^6 mismatch between UI, API, program.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const WALLET_NAMES = ["alice", "bob", "carol", "dave"] as const;
type WalletName = (typeof WALLET_NAMES)[number];

const WALLET_DIR = path.join(os.homedir(), ".config", "agent-tickets", "wallets");
const ADDRESSES_FILE = path.join(__dirname, "devnet-addresses.json");

const RPC_URL = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const USDC_DECIMALS = 6;
const TARGET_USDC_BASE_UNITS = 1_000_000_000n; // 1,000 USDC at 6dp

/** Below this, a wallet can't reliably sign its own escrow txs, so we airdrop. */
const MIN_SOL = 0.5;
/** Slack over the payer's computed rent bill, for signature fees and retries. */
const PAYER_FEE_BUFFER_LAMPORTS = 2_000_000; // 0.002 SOL
/** Devnet's per-request airdrop cap is unreliable above this. */
const AIRDROP_SOL = 1;
const AIRDROP_ATTEMPTS = 3;

/**
 * The public faucet allows 2 airdrops per 8 hours per IP. Retrying a rate-limit
 * rejection cannot succeed and only deepens the hole for everyone sharing the
 * IP — including the human trying the web faucet in parallel. Bail immediately
 * and let the operator use faucet.solana.com or a provider RPC.
 */
function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate.?limit|airdrop limit|faucet has run dry/i.test(msg);
}

interface AddressBook {
  cluster: string;
  rpcUrl: string;
  usdcMint: string;
  usdcDecimals: number;
  usdcMintAuthority: string;
  wallets: Record<string, { pubkey: string; usdcAta: string }>;
  updatedAt: string;
  /** Keys owned by sibling scripts (programId, _note, …) are preserved as-is. */
  [key: string]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(msg: string) {
  console.log(msg);
}

// ---------- keypairs ----------

function loadOrCreateKeypair(name: WalletName): { keypair: Keypair; created: boolean } {
  fs.mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(WALLET_DIR, `${name}.json`);

  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(raw) || raw.length !== 64) {
      throw new Error(`${file} is not a valid 64-byte solana keypair array`);
    }
    return { keypair: Keypair.fromSecretKey(Uint8Array.from(raw)), created: false };
  }

  const keypair = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return { keypair, created: true };
}

// ---------- SOL ----------

async function ensureSol(
  connection: Connection,
  name: WalletName,
  keypair: Keypair
): Promise<number> {
  let lamports = await connection.getBalance(keypair.publicKey);
  if (lamports >= MIN_SOL * LAMPORTS_PER_SOL) {
    log(`  ${name}: ${(lamports / LAMPORTS_PER_SOL).toFixed(3)} SOL (ok)`);
    return lamports;
  }

  for (let attempt = 1; attempt <= AIRDROP_ATTEMPTS; attempt++) {
    try {
      const sig = await connection.requestAirdrop(
        keypair.publicKey,
        AIRDROP_SOL * LAMPORTS_PER_SOL
      );
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...bh },
        "confirmed"
      );
      lamports = await connection.getBalance(keypair.publicKey);
      log(`  ${name}: airdropped -> ${(lamports / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
      return lamports;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimited(err)) {
        log(`  ${name}: faucet rate-limited, not retrying`);
        break;
      }
      if (attempt === AIRDROP_ATTEMPTS) {
        log(`  ${name}: airdrop failed after ${AIRDROP_ATTEMPTS} attempts (${msg.split("\n")[0]})`);
        break;
      }
      await sleep(2000 * 2 ** (attempt - 1)); // 2s, 4s
    }
  }

  return connection.getBalance(keypair.publicKey);
}

// ---------- address book ----------

function readAddressBook(): Partial<AddressBook> {
  if (!fs.existsSync(ADDRESSES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Reuse the recorded mint when it still exists on-chain with the layout we
 * expect; otherwise mint a fresh one. This is what makes reruns cheap instead
 * of scattering orphan mints across devnet.
 */
async function ensureMint(
  connection: Connection,
  authority: Keypair,
  existing: string | undefined
): Promise<PublicKey> {
  if (existing) {
    // A recorded mint we can't mint from is not an error — the address book
    // ships pointing at the shared devnet USDC-Dev mint, which nobody here has
    // authority over. Fall through and make our own rather than dying.
    try {
      const mint = await getMint(connection, new PublicKey(existing));
      if (mint.decimals !== USDC_DECIMALS) {
        log(
          `  recorded mint ${existing} has ${mint.decimals} decimals, need ${USDC_DECIMALS}; creating our own`
        );
      } else if (!mint.mintAuthority?.equals(authority.publicKey)) {
        log(
          `  recorded mint ${existing} is not ours ` +
            `(authority ${mint.mintAuthority?.toBase58() ?? "none"}); creating our own`
        );
      } else {
        log(`  reusing mint ${existing}`);
        return mint.address;
      }
    } catch {
      log(`  recorded mint ${existing} not found on this cluster; creating a new one`);
    }
  }

  const mint = await createMint(
    connection,
    authority,
    authority.publicKey,
    null, // no freeze authority
    USDC_DECIMALS
  );
  log(`  created mint ${mint.toBase58()}`);
  return mint;
}

/**
 * Which network the address book describes. Never assume devnet just because
 * that's the script's name — pointing SOLANA_RPC_URL at a local validator and
 * recording the result as "devnet" is how a demo ends up chasing a mint that
 * only ever existed on someone's laptop.
 */
function clusterLabel(url: string): string {
  if (/127\.0\.0\.1|localhost/.test(url)) return "localnet";
  if (/testnet/.test(url)) return "testnet";
  if (/devnet/.test(url)) return "devnet";
  if (/mainnet/.test(url)) return "mainnet-beta";
  return "unknown";
}

/** Rent for one mint + one ATA per wallet, plus a fee buffer. */
async function payerRequirementLamports(connection: Connection): Promise<number> {
  const [mintRent, ataRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(MINT_SIZE),
    connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
  ]);
  return mintRent + ataRent * WALLET_NAMES.length + PAYER_FEE_BUFFER_LAMPORTS;
}

// ---------- main ----------

async function main() {
  // disableRetryOnRateLimit: web3.js otherwise retries every 429 five times
  // under the hood, turning one airdrop attempt into six faucet hits.
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
  log(`RPC: ${RPC_URL}`);

  log(`\nWallets (${WALLET_DIR}):`);
  const wallets = WALLET_NAMES.map((name) => {
    const { keypair, created } = loadOrCreateKeypair(name);
    log(`  ${name}: ${keypair.publicKey.toBase58()}${created ? "  [new]" : ""}`);
    return { name, keypair };
  });

  log("\nFunding SOL:");
  const balances = new Map<WalletName, number>();
  for (const { name, keypair } of wallets) {
    balances.set(name, await ensureSol(connection, name, keypair));
  }

  const underfunded = wallets.filter(
    ({ name }) => (balances.get(name) ?? 0) < MIN_SOL * LAMPORTS_PER_SOL
  );
  if (underfunded.length > 0) {
    log("\n  Devnet faucet did not fund these wallets (rate limit is normal):");
    for (const { name, keypair } of underfunded) {
      log(`    ${name}  ${keypair.publicKey.toBase58()}`);
    }
    log("  Top them up at https://faucet.solana.com (paste the address, pick devnet), then rerun.");
  }

  // The payer signs the mint creation, every ATA creation, and every mint_to.
  // Only it strictly needs SOL — the others can be funded later without redoing
  // any of the work below. Gate on the actual rent bill rather than a round
  // number, so a small hand top-up is enough to unblock a rerun.
  const payer = wallets[0];
  const payerNeeds = await payerRequirementLamports(connection);
  const payerHas = balances.get(payer.name) ?? 0;
  if (payerHas < payerNeeds) {
    log(
      `\nAborting: payer '${payer.name}' has ${(payerHas / LAMPORTS_PER_SOL).toFixed(5)} SOL, ` +
        `needs ~${(payerNeeds / LAMPORTS_PER_SOL).toFixed(5)} SOL to create the mint and ` +
        `${WALLET_NAMES.length} token accounts.\n` +
        `  Fund ${payer.keypair.publicKey.toBase58()} at https://faucet.solana.com ` +
        `(check the cluster selector says devnet) and rerun.`
    );
    process.exitCode = 1;
    return;
  }

  const book = readAddressBook();
  // Same cluster, not same URL — swapping the public RPC for a provider one
  // must not orphan the mint and mint a duplicate.
  const sameCluster =
    typeof book.rpcUrl === "string" && clusterLabel(book.rpcUrl) === clusterLabel(RPC_URL);

  log("\nTest USDC mint:");
  const mint = await ensureMint(
    connection,
    payer.keypair,
    sameCluster ? book.usdcMint : undefined
  );

  log("\nToken accounts:");
  const walletBook: AddressBook["wallets"] = {};
  for (const { name, keypair } of wallets) {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.keypair,
      mint,
      keypair.publicKey
    );
    walletBook[name] = {
      pubkey: keypair.publicKey.toBase58(),
      usdcAta: ata.address.toBase58(),
    };

    const shortfall = TARGET_USDC_BASE_UNITS - ata.amount;
    if (shortfall > 0n) {
      await mintTo(
        connection,
        payer.keypair,
        mint,
        ata.address,
        payer.keypair,
        shortfall
      );
      log(
        `  ${name}: ${ata.address.toBase58()}  minted ${fmtUsdc(shortfall)} -> ${fmtUsdc(
          TARGET_USDC_BASE_UNITS
        )} USDC`
      );
    } else {
      log(`  ${name}: ${ata.address.toBase58()}  ${fmtUsdc(ata.amount)} USDC (ok)`);
    }
  }

  // Merge, don't overwrite: this file is shared with the crank and deploy
  // scripts, which own keys like programId and _note. Blowing those away on
  // every setup run breaks a teammate silently.
  const next = {
    ...book,
    cluster: clusterLabel(RPC_URL),
    rpcUrl: RPC_URL,
    usdcMint: mint.toBase58(),
    usdcDecimals: USDC_DECIMALS,
    usdcMintAuthority: payer.keypair.publicKey.toBase58(),
    _usdcMintNote:
      "usdcMint is the local 6-decimal TEST mint created by setup-devnet.ts " +
      "(authority = the first team wallet), not the shared devnet USDC-Dev faucet mint. " +
      "The team wallets hold this mint, so initialize_config must point Config.usdc_mint at it.",
    wallets: walletBook,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(next, null, 2) + "\n");

  log(`\nWrote ${path.relative(process.cwd(), ADDRESSES_FILE)}`);
  log(`Token program: ${TOKEN_PROGRAM_ID.toBase58()}`);
  log("Devnet setup complete.");
}

function fmtUsdc(baseUnits: bigint): string {
  const whole = baseUnits / 1_000_000n;
  const frac = (baseUnits % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
