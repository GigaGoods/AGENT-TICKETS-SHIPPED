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
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
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
import { fileURLToPath } from "url";
import * as __p from "path";
const __dirname = __p.dirname(fileURLToPath(import.meta.url));

const WALLET_NAMES = ["alice", "bob", "carol", "dave"] as const;
type WalletName = (typeof WALLET_NAMES)[number];

const WALLET_DIR = path.join(os.homedir(), ".config", "agent-tickets", "wallets");
const ADDRESSES_FILE = path.join(__dirname, "devnet-addresses.json");

const RPC_URL = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const SKIP_AIRDROP = process.env.SETUP_SKIP_AIRDROP === "1";
const USDC_DECIMALS = 6;
const TARGET_USDC_BASE_UNITS = 1_000_000_000n; // 1,000 USDC at 6dp

// A wallet needs SOL only to sign its own txs (~0.000005 each), so the floor is
// low; the demo allotment sits comfortably above it. Below the floor we airdrop
// (or the payer bridges); at or above it a wallet is considered ready.
const MIN_SOL = 0.05;
/** Slack over the payer's computed rent bill, for signature fees and retries. */
const PAYER_FEE_BUFFER_LAMPORTS = 2_000_000; // 0.002 SOL
/** Devnet's per-request airdrop cap is unreliable above this. */
const AIRDROP_SOL = 1;
const AIRDROP_ATTEMPTS = 3;

/** Per-wallet demo allotment when the payer bridges SOL to its peers. */
const DEMO_SOL_PER_WALLET = 0.1;
/** SOL the payer keeps for its own signing after distributing. */
const PAYER_RESERVE_LAMPORTS = 20_000_000; // 0.02 SOL

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
  testUsdcMint: string;
  testUsdcDecimals: number;
  testUsdcMintAuthority: string;
  wallets: Record<string, { pubkey: string; usdcAta: string }>;
  updatedAt: string;
  /** Keys owned by sibling scripts (usdcMint, programId, _note, …) preserved as-is. */
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

  // When the payer is already funded (e.g. hand-topped or airdropped by an
  // outer script), skip the faucet so we don't spend the 2-per-8h quota. Peers
  // still get bridged SOL from the payer in distributeSol.
  if (SKIP_AIRDROP) {
    log(`  ${name}: ${(lamports / LAMPORTS_PER_SOL).toFixed(3)} SOL (airdrop skipped)`);
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

/**
 * Top up peers from the payer's own balance for wallets the faucet couldn't
 * reach. Best-effort: transfers only what the payer can spare above its reserve,
 * updates `balances` in place, and never lets the payer drop below its reserve.
 */
async function distributeSol(
  connection: Connection,
  payer: Keypair,
  peers: { name: WalletName; keypair: Keypair }[],
  balances: Map<WalletName, number>
): Promise<void> {
  const needy = peers.filter(
    ({ name }) => (balances.get(name) ?? 0) < MIN_SOL * LAMPORTS_PER_SOL
  );
  if (needy.length === 0) return;

  const target = DEMO_SOL_PER_WALLET * LAMPORTS_PER_SOL;
  const payerName = "alice" as WalletName; // wallets[0] by construction
  let payerBalance = await connection.getBalance(payer.publicKey);

  log("\nDistributing SOL from payer to peers:");
  for (const { name, keypair } of needy) {
    const have = balances.get(name) ?? 0;
    const want = Math.max(0, target - have);
    const spendable = payerBalance - PAYER_RESERVE_LAMPORTS - 5000; // keep reserve + fee
    const amount = Math.min(want, spendable);
    if (amount <= 0) {
      log(`  ${name}: payer has nothing to spare`);
      continue;
    }

    const bh = await connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: payer.publicKey,
      blockhash: bh.blockhash,
      lastValidBlockHeight: bh.lastValidBlockHeight,
    }).add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: keypair.publicKey,
        lamports: amount,
      })
    );
    await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });

    balances.set(name, have + amount);
    payerBalance = await connection.getBalance(payer.publicKey);
    log(`  ${name}: +${(amount / LAMPORTS_PER_SOL).toFixed(3)} SOL from ${payerName}`);
  }
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

/**
 * A committable RPC URL: never the real endpoint, which may carry an API key in
 * its query string (Helius, QuickNode, …). Record the canonical public URL for
 * the cluster so the address book is portable and secret-free.
 */
function publicRpcUrl(url: string): string {
  switch (clusterLabel(url)) {
    case "devnet":
      return "https://api.devnet.solana.com";
    case "testnet":
      return "https://api.testnet.solana.com";
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    case "localnet":
      return url.replace(/\?.*$/, ""); // strip any query, keep the local port
    default:
      return url.replace(/\?.*$/, "");
  }
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

  // The faucet allows only 2 airdrops per 8h, so it can never fund all four
  // wallets in one window — yet every demo wallet needs SOL to sign its own
  // escrow txs (design doc §5.6). Bridge the gap from the payer's own balance:
  // one airdrop to the payer bootstraps the whole team. Best-effort — the mint
  // and USDC balances below do not depend on it.
  await distributeSol(connection, payer.keypair, wallets.slice(1), balances);

  const stillUnderfunded = wallets.filter(
    ({ name }) => (balances.get(name) ?? 0) < MIN_SOL * LAMPORTS_PER_SOL
  );
  if (stillUnderfunded.length > 0) {
    log("\n  These wallets are still under the SOL floor (payer could not spare enough):");
    for (const { name, keypair } of stillUnderfunded) {
      log(`    ${name}  ${keypair.publicKey.toBase58()}`);
    }
    log("  Top them up at https://faucet.solana.com (paste the address, pick devnet), then rerun.");
  }

  const book = readAddressBook();
  // Same cluster, not same URL — swapping the public RPC for a provider one
  // must not orphan the mint and mint a duplicate.
  const sameCluster =
    typeof book.rpcUrl === "string" && clusterLabel(book.rpcUrl) === clusterLabel(RPC_URL);

  // Our mint lives under `testUsdcMint`, NOT `usdcMint`. Sibling scripts already
  // use `usdcMint` for the shared devnet USDC-Dev faucet mint (4zMMC9…), which
  // nobody here has mint authority over; overwriting it would make the file
  // self-contradict. See the note we write below.
  log("\nTest USDC mint:");
  const recordedTestMint = sameCluster ? book.testUsdcMint : undefined;
  const mint = await ensureMint(
    connection,
    payer.keypair,
    typeof recordedTestMint === "string" ? recordedTestMint : undefined
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
    rpcUrl: publicRpcUrl(RPC_URL),
    testUsdcMint: mint.toBase58(),
    testUsdcDecimals: USDC_DECIMALS,
    testUsdcMintAuthority: payer.keypair.publicKey.toBase58(),
    _testUsdcMintNote:
      "testUsdcMint is the 6-decimal TEST mint created by setup-devnet.ts " +
      "(authority = the first team wallet). The team wallets in `wallets` hold THIS mint, " +
      "not the shared devnet USDC-Dev mint in `usdcMint`. initialize_config MUST set " +
      "Config.usdc_mint = testUsdcMint, or lock_purchase fails the InvalidMint constraint.",
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
