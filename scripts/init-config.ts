// Post-deploy one-shot: initialize the escrow Config PDA on devnet.
// Usage: npx ts-mocha --help >/dev/null; ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//        ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-config.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const DEVNET_USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
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
      new anchor.BN(DELIVERY_WINDOW_SECS),
      new anchor.BN(INSPECTION_WINDOW_SECS)
    )
    .accounts({
      config: configPda,
      authority: provider.wallet.publicKey,
      arbiter: provider.wallet.publicKey,
      feeDestination: provider.wallet.publicKey,
      usdcMint: DEVNET_USDC,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`Config initialized: ${configPda.toBase58()}`);
  console.log(`tx: ${sig}`);

  const addrPath = path.join(__dirname, "devnet-addresses.json");
  const addrs = fs.existsSync(addrPath) ? JSON.parse(fs.readFileSync(addrPath, "utf8")) : {};
  addrs.escrowProgram = program.programId.toBase58();
  addrs.configPda = configPda.toBase58();
  addrs.usdcMintOfficialDevnet = DEVNET_USDC.toBase58();
  fs.writeFileSync(addrPath, JSON.stringify(addrs, null, 2));
  console.log(`Addresses written to ${addrPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
