# Track A (Session 1) — final handoff: escrow program + build lane

**Branch:** `track-a` (equal to `main` at handoff; the branch is the mergeable artifact).
**Program ID:** `J26zGhTfnDVqNZcRwerK5Aen7BXyGnjjxkG9CXkbSCRv` (consistent across `declare_id!`, `Anchor.toml`, `scripts/devnet-addresses.json` — enforced by the gate below).

## The merge gate — run this, trust nothing else

```bash
npm run verify:track-a          # static + doc fidelity + typecheck + on-chain (PENDING pre-deploy)
npm run verify:track-a:full     # + all three test suites on fresh validators (~3 min)
node scripts/verify-track-a.mjs --require-devnet   # post-deploy CI mode: PENDING becomes FAIL
```

The gate checks: program-ID consistency everywhere, build artifacts + IDL completeness (all 12 instructions), the session-2 mint rule (`init-config.ts` must use `testUsdcMint` — hardcoding USDC-Dev bricks `lock_purchase` with `InvalidMint`), session-4's doc-fidelity checker, `tsc --noEmit`, the three suites (5 core + 11 edge + 19 crank), and — once deployed — that the devnet program is executable and `config.usdc_mint == testUsdcMint`.

## What Track A delivered

- **`programs/escrow/src/lib.rs`** — the escrow program, design doc §5: Config/Listing/Order accounts (reserved bytes, dormant `Disputed`/`ArbiterResolved`), two-clock state machine (`delivery_deadline` → buyer refund; `inspection_deadline` after `mark_delivered` → seller payout; `event_start_ts` ±grace clamps), permissionless `timeout_refund`/`timeout_release`, fee at release, state-before-CPI, `token_interface` (Token-2022-ready), all 8 events, 17 error codes.
- **Toolchain fixes committed in `Cargo.lock`** — SBF platform-tools bundle cargo 1.79; pins: `zeroize 1.8.1`, `zeroize_derive 1.4.2`, `blake3 1.5.5`. Nobody re-fights this.
- **Tests** — `tests/escrow.test.ts` (5), plus ESM/interop repairs to session-3/4 suites (`BN` from bn.js, explicit `tokenProgram`, `require.cache` guard). Suites can't share a validator (singleton Config): core runs via `anchor test`, edge via its own validator (`npm run test:edge` standalone, or the gate's managed run).
- **`scripts/init-config.ts`** — post-deploy config init: fee 0 bps, 24h delivery / 48h inspection, **`usdc_mint = testUsdcMint`** per session-2 handoff §4.
- **`scripts/verify-track-a.mjs`** — the merge gate above.

## Post-deploy runbook (blocked only on SOL for `2wLoyTXpQ4nJA4Pv9mftU7oizQ764xNn8w5RtGfZoZGs`)

An armed watcher auto-runs 1–2 when funded; manual equivalent:
1. `anchor deploy --provider.cluster devnet`
2. `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json node scripts/init-config.ts`
3. `node scripts/verify-track-a.mjs --require-devnet` — must PASS
4. Crank end-to-end: `npm run crank -- --dry-run --once`, then live (funded keypair pays only tx fees)
5. Flip `programs.devnet` consumers to the deployed program (`scripts/devnet-addresses.json` gains `configPda`/`configUsdcMint` from step 2)

## Decisions log (so nobody relitigates)

1. **No universal `now > event_start` refund** (session-4 finding 4): deliberate — it would let a buyer attend and then refund a delivered-but-unconfirmed order. Undelivered orders are already refundable by event−2h via the delivery-deadline clamp.
2. **Indexers project off events, never account polling** — settlement closes accounts in the same tx (session-4 finding 1); `resolve_dispute` emits only `DisputeResolved` (finding 2).
3. **`Disputed` orders have no timeout** — only the arbiter moves them; monitor `escrow_stuck_count` (finding 3).
4. **`paused` gates only new listings/purchases**, never live-order settlement (FinCEN control-test posture).
5. **Anchor pinned 0.31.1** (matches installed CLI); upgrade to 1.x is a later, deliberate move.
6. Edge-suite timing: the 4-second demo windows can flake under validator load (~1 in 5); a rerun is authoritative. Widen windows if it annoys CI.

## Security FYI (from session 2 §7, repeated so it isn't lost)

A personal burner wallet (`9Wxozs…`) had its **seed phrase exposed** during faucet setup and holds ~0.02 real SOL on mainnet — move anything of value off it and never reuse it. Not a project artifact; team hygiene note.

## PRD alignment (Track A slice)

Repo copy at `docs/PRD.md` (the submitted, scope-cut version — it names the "on-chain escrow purchase/release flow" as the designed next layer on the listing rail). Track A delivers exactly that layer, upgraded from the PRD's single-timer wording to the two-clock design (a single timer pays ghosting sellers; design doc §5.3). Listing/browse/API surfaces consume it via `docs/escrow-integration.md`.
