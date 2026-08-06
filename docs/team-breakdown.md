# Agent-Tickets — 4-Person Work Breakdown

Source of truth: `docs/superpowers/specs/2026-08-06-agent-tickets-design.md`. Each track owns a unit with a defined interface; the **shared contracts everyone codes against are frozen first** (Day 1, all hands, ~2h): the order state machine (§7.4), the Zod schema set, and the escrow program's instruction list (§5.2).

## Track A — On-chain escrow program (Rust/Anchor)
**Owns:** the money. `agent_tickets_escrow`: Config/Listing/Order accounts with reserved bytes + dormant dispute fields, the two-clock state machine (`create_listing`, `cancel_listing`, `lock_purchase`, `mark_delivered`, `confirm_receipt`, `timeout_release`, `timeout_refund`, `cancel_purchase`), Anchor events, PDA-owned USDC vault.
**Also:** LiteSVM test suite (both timeout paths, double-buy rejection, fee math at 0/300bps, event-start backstop), devnet deploy, the permissionless crank script, later Squads authority + audit prep.
**Interface delivered:** the IDL + emitted events. Feeds B's indexer and B's tx construction.
**Definition of done (week 1):** all 9 instructions passing tests on devnet; crank running.

## Track B — Backend: service layer + indexing (TypeScript)
**Owns:** the one write path. `packages/core` domain services; **every operation defined once as a Zod schema generating the OpenAPI doc, REST handlers, and MCP tool defs** (this discipline is the whole architecture — see r12). Idempotency both layers (HTTP key + PDA derivation), server-side spend caps, audit rows, per-principal rate limits.
**Also:** Postgres (`chain_events` + slot-guarded projections + transactional cursors), holds (`FOR UPDATE SKIP LOCKED`), write-through + poll reconciler now → Helius gRPC/webhooks at mainnet, graphile-worker timers.
**Interface delivered:** REST API + webhooks + the generated schema package.
**Definition of done (week 1):** list→buy→confirm/timeout E2E against A's devnet program via API only.

## Track C — Agent surface + payments security
**Owns:** the differentiator. MCP server: the nine `tickets.*` tools with `outputSchema`/`structuredContent`, `isError` recovery hints, opaque order handles, `next_actions`. Agent auth (scoped API keys → OAuth 2.1/RFC 9728), MCP Registry publish (DNS-verified), Web Bot Auth allow rule, robots/JSON-LD agent-discovery exits.
**Also:** the server-built-transaction signing flow (agent expresses intent, server constructs tx, agent signs — no generic transfer tool exists), untrusted-listing-text delimiting, the reference buying agent + demo script, later Turnkey/Privy policy-signer swap.
**Interface delivered:** the MCP endpoint + agent onboarding doc.
**Definition of done (week 1):** an agent with a fresh keypair completes search→buy→confirm E2E on devnet — the original PRD demo.

## Track D — Web UI, onboarding, and the outside world
**Owns:** humans and go-to-market. Next.js UI (browse/search, listing detail + buy, sell form, my-orders with confirm/not-delivered), Phantom + SIWS, USD-only display discipline, JSON-LD event pages.
**Also (start immediately, they're gated):** Stripe onramp + Crossmint applications; Privy integration prep + Kora gasless (week 3–4); OFAC screening provider selection for mainnet; the conference-circuit organizer outreach (designated-resale-channel pitch — the Tixel play), first reference organizer.
**Interface consumed:** B's API only — the UI must never gain a private path the agents lack.
**Definition of done (week 1):** a human can do everything C's agent can do, from a browser.

## Dependencies & sequence
- Day 1: freeze shared contracts (state machine, schemas, instruction list). B scaffolds the schema package immediately — it unblocks C and D.
- A runs independent until the week-1 integration milestone; B integrates A's IDL as soon as instructions land.
- Critical path to the flagship demo: **A → B → C**. D parallelizes fully.
- Week-by-week shortcut replacement schedule: r12 §11 (16-row table) in `scratchpad/research/12-architecture.md` — copy it into the repo before the scratchpad is cleaned up.

## Milestones
- **M1 (week 1):** escrow live on devnet; API-only E2E trade.
- **M2 (week 2):** agent E2E via MCP + human E2E via UI on the same inventory; holds + idempotency proven under retry storms.
- **M3 (week 3–4):** dispute freeze + arbiter, alias delivery-oracle prototype, embedded wallets; mainnet-beta gates checklist (counsel memo on the control test, OFAC screening, Squads authority) begins.
