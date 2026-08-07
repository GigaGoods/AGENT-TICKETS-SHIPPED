# Handoff — Session 2: Devnet money plumbing

**Lane:** `scripts/setup-devnet.ts` (devnet wallets, test USDC mint, funding)
**Status:** ✅ Complete and verified on **real devnet**. One cross-session action is required before an end-to-end escrow demo (see §4).
**Branch:** `main` — all work committed (§5). Working tree clean.

Paste this whole file into the main/integration session; it is self-contained.

---

## 1. Original task (verbatim scope)

Build `scripts/setup-devnet.ts` (Node/TypeScript; deps `@solana/web3.js` + `@solana/spl-token`):

1. Load or create keypairs for 4 team wallets at `~/.config/agent-tickets/wallets/{alice,bob,carol,dave}.json` (create dir if needed).
2. Ensure each has devnet SOL: `requestAirdrop` with retries/backoff; if rate-limited, print the addresses and instruct topping up at faucet.solana.com.
3. Create a 6-decimal test USDC mint (authority = first wallet); save the mint address to `scripts/devnet-addresses.json`.
4. Create ATAs for all wallets and mint each 1,000 USDC (1_000_000_000 base units).
5. Idempotent: rerunning must not fail or double-create.

Plus: add an npm script `setup:devnet`; test it for real against devnet; commit only my own files.

---

## 2. Requirement-by-requirement evidence

| # | Requirement | Status | Evidence (all on real devnet unless noted) |
|---|---|---|---|
| 1 | 4 keypairs at `~/.config/agent-tickets/wallets/*.json` | ✅ | Files exist, mode `0600`, dir `0700`. Solana-CLI byte-array format. Load-or-create verified across many reruns. |
| 2 | Ensure devnet SOL, backoff, graceful rate-limit | ✅ | Airdrop w/ 2s→4s backoff; **immediate bail on 429** (no retry storm); `disableRetryOnRateLimit`. Faucet-exhausted path prints addresses + faucet URL. Payer bridges SOL to peers (see §3). |
| 3 | 6-decimal test mint, authority = wallet[0], saved to file | ✅ | `testUsdcMint = 8ojgAs4EJBjJFQxJJVFLoieGjEpfGrH9zSao3XxVUEjh`, decimals **6**, authority **alice**. Saved under `testUsdcMint` key (not `usdcMint` — see §4). |
| 4 | ATAs for all wallets + 1,000 USDC each (base units 1e9) | ✅ | All four ATAs created; each holds exactly 1000.000000 USDC. Independently re-read on-chain: `dave` ATA → mint `8ojgAs…`, amount 1000. |
| 5 | Idempotent | ✅ | Reruns reuse the recorded mint, re-mint nothing (only the shortfall to 1000), skip existing ATAs. Verified: cold-create, rerun, partial-spend top-up, over-target skip, foreign-mint fallback. |
| — | npm script `setup:devnet` | ✅ | `"setup:devnet": "ts-node scripts/setup-devnet.ts"`. Also declared `ts-node@^10.9.2` explicitly (was only transitive via ts-mocha's ancient 7.0.1; `crank` depends on it too). |
| — | Tested for real against devnet | ✅ | Ran against devnet via Helius RPC (public RPC 429'd under load). All balances confirmed on-chain. |

---

## 3. On-chain artifacts (devnet)

**Test USDC mint:** `8ojgAs4EJBjJFQxJJVFLoieGjEpfGrH9zSao3XxVUEjh` — 6 decimals, mint authority `alice`.

| Wallet | Pubkey | USDC ATA | Holds |
|---|---|---|---|
| alice (payer/authority) | `D4E4vqwamFbgzDg9miGYcxsNyjnHBT5GbLehgXYLhU14` | `3eiZDwo8o2LxGKV7t3jWy9KGUgbPs81aQHGh71h6vGCA` | ~0.69 SOL, 1000 USDC |
| bob | `GQTWAYbCgD2wiJswTG8jCQA1aGUdTDD4nkU44x6oCgZf` | `AeXGAns9W2utdXLaac4yo4WaeAa9j4bjweDHVSwV1UyY` | ~0.10 SOL, 1000 USDC |
| carol | `4Pe6G6HuYP3xBCTK5cVsrY7qFtHt3DB59cRCeWy1c2Gr` | `EZLmsDDD5CVfq7nxrugkmkv6sBGUX6Bkigej85X2ZBh6` | ~0.10 SOL, 1000 USDC |
| dave | `5exZrx5GnhR8BAmDQ7bgUk7DQJpxUBWGG5WohZCpS2qM` | `HuJA7NNMTNjoMQX6jsjkhczAyaPrgtXQU2jQJ9NDyB6N` | ~0.10 SOL, 1000 USDC |

Full record lives in `scripts/devnet-addresses.json` (committed). Private keys are **outside the repo** at `~/.config/agent-tickets/wallets/` and are not committed.

**Funding note:** the faucet allows only 2 airdrops / 8h / IP, so it can't fund all four wallets. The script funds the **payer** once (via faucet or hand top-up), then the payer **bridges** 0.1 SOL to each peer — one airdrop bootstraps the whole team. `SETUP_SKIP_AIRDROP=1` skips the faucet when the payer is already funded.

---

## 4. ⚠️ CROSS-SESSION ACTION REQUIRED — mint mismatch (blocks the escrow demo)

This is the one thing that must be reconciled before `lock_purchase` → settle works end-to-end.

- **Session 1's `init-config.ts`** hardcodes `Config.usdc_mint = 4zMMC9…` (the shared devnet **USDC-Dev** faucet mint). Nobody on the team has mint authority over it, so we cannot fund wallets with it.
- **Session 2 (this lane)** was tasked to create *our own* 6-decimal mint. The team wallets hold **`testUsdcMint = 8ojgAs…`**, and hold **zero** of `4zMMC9`.
- **Consequence:** with Config pointing at `4zMMC9`, `lock_purchase` fails the `InvalidMint` / token-account constraint — buyer's token mint (`8ojgAs`) ≠ `config.usdc_mint` (`4zMMC9`).

**Fix (Session 1 / build lane owns `init-config.ts`):** set `Config.usdc_mint = testUsdcMint` (`8ojgAs…`), i.e. read `testUsdcMint` from `scripts/devnet-addresses.json` instead of the hardcoded `DEVNET_USDC`. The crank reads the mint from the on-chain Config, so once Config is correct the crank follows automatically.

Both keys are documented in `devnet-addresses.json`:
- `usdcMint` = `4zMMC9…` — shared USDC-Dev mint (Session 1's field, untouched).
- `testUsdcMint` = `8ojgAs…` — our mint that the wallets actually hold. `_testUsdcMintNote` spells out the requirement.

I did **not** edit `init-config.ts` — it belongs to another session and editing across lanes is how files get clobbered.

---

## 5. Commits on this lane (already on `main`)

- `b931240` — Real devnet run: test USDC mint + 4 funded wallets; no key leak, no field clobber
- `7699483` — setup-devnet: bootstrap the whole team from one airdrop (payer→peers SOL bridge, `SETUP_SKIP_AIRDROP`)
- `61bb262` — Harden setup-devnet: share the address book (merge, don't overwrite), tolerate foreign mints
- `b9437ad` — Declare `ts-node` explicitly (`setup:devnet` + `crank` depend on it)

Files touched (mine only): `scripts/setup-devnet.ts`, `scripts/devnet-addresses.json` (merge-only), `package.json` (added `setup:devnet` + `ts-node`), `package-lock.json`.

---

## 6. How to re-run / verify (integration session)

```bash
# Default: public devnet RPC. If the payer already has SOL, skip the faucet:
SETUP_SKIP_AIRDROP=1 npm run setup:devnet

# Under RPC rate limits, point at a provider (key stays out of the committed file):
SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY" SETUP_SKIP_AIRDROP=1 npm run setup:devnet

npm run typecheck   # tsc --noEmit, whole project
```

The script is idempotent — safe to run repeatedly. It records only the **public** RPC URL to the address book (never a keyed endpoint), and **merges** the file (preserves `programId`, `usdcMint`, `_note`, and any sibling keys).

---

## 7. Loose ends / FYI

- **Orphan mint:** the first devnet attempt was interrupted mid-run by a public-RPC 429 and created one orphan mint (`EmShd1J…`, ~0.002 SOL rent, harmless, unused). The live mint is `8ojgAs…`.
- **RPC:** Helius devnet key works for RPC calls but its **faucet** is capped at 1 SOL/day/project (spent). Public faucet is 2/8h/IP.
- **Faucet GitHub login:** irrelevant to the project — pure anti-abuse gating, touches nothing that's committed.
- **Mainnet dust:** a personal wallet (`9Wxozs…`) used to pass the QuickNode faucet's mainnet-balance gate holds ~0.02 real SOL, and its seed phrase was exposed during setup — move any value off it and treat it as burner-only. (Not a project artifact.)

---

## 8. One-paragraph summary for the main session

Session 2 (devnet money plumbing) is complete and verified on real devnet: four team wallets exist at `~/.config/agent-tickets/wallets/`, each funded with SOL and 1,000 units of a 6-decimal test USDC mint `8ojgAs4EJBjJFQxJJVFLoieGjEpfGrH9zSao3XxVUEjh` (authority = alice). All addresses are in `scripts/devnet-addresses.json` under `testUsdcMint` + `wallets`; `npm run setup:devnet` is idempotent. **The single integration blocker:** `init-config.ts` must set `Config.usdc_mint = testUsdcMint` (`8ojgAs…`) instead of the hardcoded USDC-Dev mint `4zMMC9…`, or `lock_purchase` fails `InvalidMint`.
