#!/usr/bin/env node
// Track A merge gate — run before merging escrow-lane work, and at integration time.
//   node scripts/verify-track-a.mjs              # static + doc fidelity + on-chain (PENDING until deployed)
//   node scripts/verify-track-a.mjs --tests      # + all three test suites (spawns validators; ~3 min)
//   node scripts/verify-track-a.mjs --require-devnet  # on-chain PENDING becomes FAIL (post-deploy CI mode)
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const RUN_TESTS = args.includes("--tests");
const REQUIRE_DEVNET = args.includes("--require-devnet");

let failures = 0;
let pending = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };
const pend = (m) => { pending++; console.log(`  … PENDING: ${m}`); };
const section = (m) => console.log(`\n== ${m}`);

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: ROOT, stdio: "pipe", encoding: "utf8", timeout: 600_000, ...opts });

// ---------- 1. Static consistency ----------
section("Program identity is consistent everywhere");
const libRs = read("programs/escrow/src/lib.rs");
const declared = libRs.match(/declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/)?.[1];
declared ? ok(`declare_id: ${declared}`) : bad("no declare_id! in lib.rs");
const anchorToml = read("Anchor.toml");
const tomlIds = [...anchorToml.matchAll(/agent_tickets_escrow = "([1-9A-HJ-NP-Za-km-z]+)"/g)].map((m) => m[1]);
tomlIds.length === 2 && tomlIds.every((id) => id === declared)
  ? ok("Anchor.toml localnet + devnet match declare_id")
  : bad(`Anchor.toml IDs ${JSON.stringify(tomlIds)} != ${declared}`);
const addrs = JSON.parse(read("scripts/devnet-addresses.json"));
addrs.programId === declared
  ? ok("devnet-addresses.json programId matches")
  : bad(`devnet-addresses.json programId ${addrs.programId} != ${declared}`);

section("Build artifacts");
const soPath = path.join(ROOT, "target/deploy/agent_tickets_escrow.so");
fs.existsSync(soPath) && fs.statSync(soPath).size > 100_000
  ? ok(`program binary present (${(fs.statSync(soPath).size / 1024).toFixed(0)} KB)`)
  : bad("target/deploy/agent_tickets_escrow.so missing or suspiciously small");
let idl = null;
try {
  idl = JSON.parse(read("target/idl/agent_tickets_escrow.json"));
  idl.address === declared ? ok("IDL address matches declare_id") : bad(`IDL address ${idl.address} != ${declared}`);
  const rustIx = [...libRs.matchAll(/^    pub fn ([a-z_0-9]+)\(/gm)].map((m) => m[1]);
  const idlIx = idl.instructions.map((i) => i.name).sort();
  const missing = rustIx.filter((n) => !idlIx.includes(n));
  missing.length === 0
    ? ok(`IDL carries all ${rustIx.length} instructions`)
    : bad(`IDL missing instructions: ${missing.join(", ")}`);
} catch {
  bad("target/idl/agent_tickets_escrow.json missing or unparseable");
}

section("Escrow config mint rule (session-2 handoff §4)");
addrs.testUsdcMint ? ok(`testUsdcMint recorded: ${addrs.testUsdcMint}`) : bad("no testUsdcMint in devnet-addresses.json");
const initCfg = read("scripts/init-config.ts");
initCfg.includes("testUsdcMint")
  ? ok("init-config.ts reads testUsdcMint (not hardcoded USDC-Dev)")
  : bad("init-config.ts does not read testUsdcMint — lock_purchase would fail InvalidMint");
addrs.wallets && Object.keys(addrs.wallets).length >= 4
  ? ok(`${Object.keys(addrs.wallets).length} funded team wallets recorded`)
  : bad("team wallets missing from devnet-addresses.json");

section("Doc fidelity (session-4 checker)");
try {
  sh("node scripts/verify-escrow-docs.mjs");
  ok("escrow-integration.md matches lib.rs (0 discrepancies)");
} catch (e) {
  bad(`doc checker failed:\n${(e.stdout || e.message).toString().slice(0, 500)}`);
}

section("TypeScript typecheck");
try {
  sh("npx tsc --noEmit -p tsconfig.json");
  ok("tsc --noEmit clean");
} catch (e) {
  bad(`typecheck failed:\n${(e.stdout || "").toString().slice(0, 500)}`);
}

// ---------- 2. Test suites (opt-in: they spawn validators) ----------
if (RUN_TESTS) {
  section("Crank suite (no validator)");
  try {
    const out = sh("npx ts-mocha -p ./tsconfig.json -t 60000 tests/crank.test.ts");
    const m = out.match(/(\d+) passing/);
    m && Number(m[1]) >= 19 && !/failing/.test(out) ? ok(`crank: ${m[1]} passing, 0 failing`) : bad(`crank suite: ${out.slice(-300)}`);
  } catch (e) {
    bad(`crank suite failed: ${(e.stdout || e.message).toString().slice(-400)}`);
  }

  const withValidator = async (label, mochaTarget, minPassing) => {
    section(`${label} (fresh validator)`);
    const v = spawn(
      "solana-test-validator",
      ["-r", "--bpf-program", declared, "target/deploy/agent_tickets_escrow.so", "--quiet"],
      { cwd: ROOT, stdio: "ignore", detached: false }
    );
    try {
      await new Promise((r) => setTimeout(r, 9000));
      sh(`solana airdrop 100 $(solana address) --url http://127.0.0.1:8899`, { shell: "/bin/zsh" });
      const out = sh(
        `ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=$HOME/.config/solana/id.json npx ts-mocha -p ./tsconfig.json -t 1000000 ${mochaTarget}`,
        { shell: "/bin/zsh" }
      );
      const m = out.match(/(\d+) passing/);
      m && Number(m[1]) >= minPassing && !/failing/.test(out)
        ? ok(`${label}: ${m[1]} passing, 0 failing`)
        : bad(`${label}: ${out.slice(-300)}`);
    } catch (e) {
      bad(`${label} failed: ${(e.stdout || e.message).toString().slice(-400)}`);
    } finally {
      v.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 1500));
    }
  };
  await withValidator("Core escrow suite", "tests/escrow.test.ts", 5);
  await withValidator("Edge suite", "tests/escrow-edge.test.ts", 11);
}

// ---------- 3. On-chain devnet state ----------
section("Devnet deployment");
try {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const conn = new Connection(addrs.rpcUrl || "https://api.devnet.solana.com", "confirmed");
  const prog = await conn.getAccountInfo(new PublicKey(declared));
  if (!prog) {
    (REQUIRE_DEVNET ? bad : pend)("program not yet deployed to devnet (waiting on SOL funding)");
  } else if (!prog.executable) {
    bad("program account exists but is not executable");
  } else {
    ok("program deployed and executable on devnet");
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], new PublicKey(declared));
    const cfg = await conn.getAccountInfo(configPda);
    if (!cfg) {
      (REQUIRE_DEVNET ? bad : pend)("config PDA not initialized (run init-config)");
    } else {
      // Config layout: 8 disc + authority 32 + arbiter 32 + fee_bps 2 + fee_destination 32, then usdc_mint 32
      const mint = new PublicKey(cfg.data.subarray(106, 138)).toBase58();
      mint === addrs.testUsdcMint
        ? ok(`config.usdc_mint == testUsdcMint (${mint})`)
        : bad(`config.usdc_mint is ${mint}, expected testUsdcMint ${addrs.testUsdcMint}`);
    }
  }
} catch (e) {
  (REQUIRE_DEVNET ? bad : pend)(`devnet check unreachable: ${e.message}`);
}

// ---------- verdict ----------
console.log("\n" + "=".repeat(60));
console.log(`RESULT: ${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s), ${pending} pending (deploy-gated)`);
process.exit(failures === 0 ? 0 : 1);
