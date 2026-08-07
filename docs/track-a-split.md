# Track A — 4-session split

- Session 1 (lead): escrow program build, keys sync, green tests, devnet deploy + initialize_config. Owns programs/, Anchor.toml, tests/escrow.test.ts. Only session that runs anchor build/deploy.
- Session 2: scripts/setup-devnet.ts — team wallets, test USDC mint, ATAs, funding. Owns scripts/setup-devnet.ts + scripts/devnet-addresses.json.
- Session 3: scripts/crank.ts — permissionless timeout crank (60s loop; timeout_refund for Locked past delivery_deadline, timeout_release for Delivered past inspection_deadline). Owns scripts/crank.ts.
- Session 4: docs/escrow-integration.md (Track B handoff: PDAs, per-instruction account tables, state machines, errors, events) + tests/escrow-edge.test.ts (cancel/dispute/edge cases). Owns those two files.

Rules: git pull --rebase before every commit; commit only your own files; lib.rs is session-1-only.
