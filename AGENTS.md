# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project

**Agent Tickets** — a peer-to-peer event ticket marketplace on Solana. An Anchor
escrow program holds the buyer's USDC until the buyer confirms receipt (or a
timeout settles it), replacing the 20–30% cut a custodial resale platform takes.
The same marketplace is exposed over an MCP server and a public HTTP API so AI
agents can list, browse, and purchase without a human in the loop.

**Status: pre-implementation.** The repo is not scaffolded yet — `README.md`
describes the intended V1, not shipped code. Expect to create directories rather
than find them.

Devnet only. Nothing in this repo should touch mainnet or real funds.

## Commit convention

**Every commit must include the Cursor co-author trailer.** No exceptions —
this applies to commits made by any agent, in any workflow, including amends,
rebased commits, and squashed merges.

Use Cursor's official co-author identity, exactly:

```
Co-authored-by: Cursor Agent <cursoragent@cursor.com>
```

The trailer goes in the commit message body, separated from the subject and
body by a blank line:

```
feat(escrow): add timeout-based settlement instruction

Buyer-confirm is the fast path; this is the backstop for a buyer who
never confirms. Timeout is read from the escrow account, not the client.

Co-authored-by: Cursor Agent <cursoragent@cursor.com>
```

Concretely, when committing from the shell:

```bash
git commit -m "feat(escrow): add timeout-based settlement instruction" \
           -m "Buyer-confirm is the fast path; this is the backstop." \
           -m "Co-authored-by: Cursor Agent <cursoragent@cursor.com>"
```

If you add other co-author trailers, keep this one alongside them — one
`Co-authored-by:` line per author, no blank lines between trailers.

Other commit rules:

- Subject line in imperative mood, ≤72 characters, `type(scope): summary`.
- One logical change per commit. Don't bundle a refactor with a feature.
- Never commit `.env`, keypairs, or any secret. `.env.example` is the only env
  file that belongs in git.
- Don't commit or push unless asked. If asked and you're on `main`, branch first.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16, React 19, deployed on Vercel |
| Chain | Solana (devnet) |
| Escrow program | Anchor 0.32 (Rust) |
| Wallet | Phantom, via `@solana/wallet-adapter-react` |
| Payments | USDC (SPL token) |
| Agent access | MCP server (`@modelcontextprotocol/sdk`) + public HTTP API |
| Language | TypeScript |
| Editor | Cursor |

## Commands

```bash
npm install
npm run dev            # Next.js dev server
npm run build
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run anchor:build
npm run anchor:test
npm run anchor:deploy  # devnet
npm run mcp            # MCP server
```

Run `npm run lint` and `npm run typecheck` before committing TypeScript changes;
run `npm run anchor:test` before committing anything under `programs/`.

The Anchor commands need the Solana CLI and Anchor toolchain installed
separately — they are not npm dependencies, so `anchor:*` scripts will fail on a
machine that only ran `npm install`.

## Intended layout

```
app/            Next.js routes — listings, purchase flow, wallet connect
components/     UI, wallet adapter providers
lib/            Solana client, escrow program bindings, USDC helpers
programs/       Anchor escrow program (Rust)
tests/          Anchor integration tests
mcp/            MCP server exposing the marketplace to agents
```

## Conventions

- **TypeScript, strict.** No `any` in committed code; no `@ts-ignore` without a
  comment explaining why.
- **Money is integers.** USDC has 6 decimals — handle amounts as base units
  (`bigint`/`BN`), never floats. Format only at the display edge.
- **The program is the authority.** Escrow rules — release conditions, timeout,
  who can sign what — are enforced on-chain. Client-side checks are UX, not
  security; never move a constraint out of the program into the frontend.
- **Config comes from env**, not literals. Program IDs, RPC URLs, the USDC mint,
  and the escrow timeout live in `.env` (see `.env.example`). The USDC mint and
  program ID differ per cluster — never hardcode either.
- **Cluster safety.** Don't add mainnet endpoints, mainnet mints, or
  mainnet-beta defaults. If a change would make a mainnet transaction possible,
  stop and ask.
- **Agent-facing surfaces are public API.** Changes to the MCP tool schemas or
  the HTTP API are breaking changes for agent callers — call them out
  explicitly in the commit message.

## Open questions

Don't resolve these unilaterally; ask before designing around one.

- Ticket delivery is off-chain, so escrow secures the money but doesn't prove
  transfer. Whether V1 needs a dispute path or accepts timeout as the only
  remedy is undecided.
- When an agent buys, who confirms receipt — the agent or the human it acts for?
- The fee model (take rate, and whether it's collected in-program or off-chain)
  is unspecified.
