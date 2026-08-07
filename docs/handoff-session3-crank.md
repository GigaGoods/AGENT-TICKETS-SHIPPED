# HANDOFF — Session 3: Timeout crank (permissionless settlement)

**Commits:** `9a9b023` (crank), `f017a2b` (core extraction + tests). Both on `main`.
This session never touched `lib.rs` and never ran `anchor build/deploy/test`.

## Files owned by this session

- **`scripts/crank.ts`** — the crank. Loads the IDL from `target/idl/agent_tickets_escrow.json`
  at runtime, program ID + RPC from `scripts/devnet-addresses.json` (env overrides: `RPC_URL`,
  `PROGRAM_ID`, `CRANK_KEYPAIR`, `CRANK_INTERVAL_MS`). Flags: `--once`, `--dry-run`.
  - Reads `config.usdcMint` / `feeDestination` on-chain; detects Token vs Token-2022 from the
    mint owner.
  - Uses cluster block time (not wall clock) so it never fires early into `DeadlineNotReached`.
  - Sequential ticks — a slow tick cannot overlap the next and double-submit.
  - Lost races (account closed, state changed, duplicate tx, seed mismatch) are classified as
    skips; real failures log with program logs and never kill the loop.
- **`scripts/crank-core.ts`** — pure decision logic, no RPC/wallet/clock:
  - `selectDue`: Locked && now > delivery_deadline → `timeout_refund`;
    Delivered && now > inspection_deadline → `timeout_release`; strict `>` matching the
    program's `require!(now > deadline)`.
  - `stateOf`, `isBenignRace`.
- **`tests/crank.test.ts`** — 17 passing / 2 pending, no validator or RPC needed. Covers both
  timeout paths, the `now == deadline` boundary (must NOT select), zero-inspection-deadline,
  terminal states, mixed batches, and the race classifier (including logs-only errors and that
  genuine failures aren't swallowed). Run:
  `npx ts-mocha -p ./tsconfig.json tests/crank.test.ts`
- **`scripts/devnet-addresses.json`** — programId is still the `declare_id!` **placeholder**
  (`Fg6P...LnS`). ⚠️ Shared surface: session 1's `setup-devnet.ts` / `init-config.ts` may also
  want to own this file — reconcile so exactly one session writes it post-deploy.
- **`package.json`** — added `"crank"` and `"typecheck"` scripts.

## Blocked / for the main session to close out once the program deploys

1. **IDL account-set check (the one real risk):** the 2 pending tests assert the crank's
   `.accounts({...})` sets for `timeoutRefund` / `timeoutRelease` exactly match the IDL. They
   auto-run once `target/idl/agent_tickets_escrow.json` exists (verified working via
   `CRANK_IDL_PATH` fixtures: passes on a matching IDL, fails on a mismatched one). Anchor 0.31
   with `resolution = true` may want resolvable accounts omitted — if the test fails, fix
   `crank.ts`'s account lists, not the test.
2. **Real program ID** into `scripts/devnet-addresses.json` after `anchor deploy`.
3. **End-to-end:** `npm run crank -- --dry-run --once` against devnet with a real expired
   order, then live. Needs a funded crank keypair (it only pays tx fees; it receives nothing —
   rent goes to buyer/seller per the program).
4. **Optional product step:** crank actions are logged as JSON (order, listing, buyer, seller,
   amount, signature) — easy to surface in the demo server as "settled by bot" proof of the
   agent-native story.

## Validation as of handoff

- `npm run typecheck` clean.
- Crank suite: 17 passing / 2 pending / 0 failing.
- `npm run crank -- --dry-run --once` correctly exits with "IDL not found" until the build lands.
