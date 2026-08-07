// Post-deploy one-shot: initialize the escrow Config PDA on devnet.
// Usage: npx ts-mocha --help >/dev/null; ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//        ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-config.ts
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Session-2 handoff §4: Config.usdc_mint MUST be the team's test mint (the one the
// wallets actually hold), not the shared USDC-Dev mint, or lock_purchase fails InvalidMint.
const ADDRS_PATH = path.join(__dirname, "devnet-addresses.json");
const ADDRS = JSON.parse(fs.readFileSync(ADDRS_PATH, "utf8"));
const CONFIG_USDC = new PublicKey(ADDRS.testUsdcMint || ADDRS.usdcMint);
const FEE_BPS = 0; // fee switch stays off until V1.5
const DELIVERY_WINDOW_SECS = 24 * 3600;
const INSPECTION_WINDOW_SECS = 48 * 3600;

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/agent_tickets_escrow.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const existing = await provider.connection.getAccountInfo(configPda);
  if (existing) {
    console.log(`Config already initialized at ${configPda.toBase58()} — nothing to do.`);
    return;
  }

  const sig = await program.methods
    .initializeConfig(
      FEE_BPS,
      new BN(DELIVERY_WINDOW_SECS),
      new BN(INSPECTION_WINDOW_SECS)
    )
    .accounts({
      config: configPda,
      authority: provider.wallet.publicKey,
      arbiter: provider.wallet.publicKey,
      feeDestination: provider.wallet.publicKey,
      usdcMint: CONFIG_USDC,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`Config initialized: ${configPda.toBase58()}`);
  console.log(`tx: ${sig}`);

  const addrPath = path.join(__dirname, "devnet-addresses.json");
  const addrs = fs.existsSync(addrPath) ? JSON.parse(fs.readFileSync(addrPath, "utf8")) : {};
  addrs.escrowProgram = program.programId.toBase58();
  addrs.configPda = configPda.toBase58();
  addrs.configUsdcMint = CONFIG_USDC.toBase58();
  fs.writeFileSync(addrPath, JSON.stringify(addrs, null, 2));
  console.log(`Addresses written to ${addrPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
