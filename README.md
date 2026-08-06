# Agent-Tickets

**Product name + one-liner**
Agent-Tickets — a peer-to-peer event-ticket marketplace where humans and AI agents alike can list and browse tickets, designed to settle in USDC escrow on Solana.

**Problem**
Resale platforms charge 20–30% in combined fees, and none of them let an AI shopping agent transact — every checkout assumes a human clicking a webpage. Meanwhile the P2P resale that already happens in DMs and group chats has zero protection for either side.

**Solution**
One live marketplace with two front doors: a human lists a ticket with a simple form, an AI agent lists or reads inventory with a single JSON API call, and both see the same listings instantly. Agents are first-class users of the exact same inventory — not scrapers. The Solana USDC escrow settlement layer is fully designed (spec committed in the repo) and slots onto this listing rail next.

**Core features (V1)**
- List a ticket for sale via web form: event name, date, venue, price in USDC
- Live listings page — new tickets appear instantly for everyone
- Agent JSON API: `POST /api/listings` to list a ticket, `GET /api/listings` to read inventory — same live data as the web UI
- Validation with machine-readable errors so agent callers can self-correct

**Out of scope** (cut at submission — scope-lock rules allow cuts, not adds)
- On-chain escrow purchase/release flow — fully designed in the repo's design doc, not live tonight
- MCP server wrapper (the JSON API is tonight's agent surface)
- Fiat onramp, disputes/arbitration, KYC/compliance, mobile apps
- Native NFT ticket issuance and venue/door verification

**Success criteria**
On stage: a judge lists a ticket through the web form and watches it appear instantly in live listings; then an AI agent creates a second listing through `POST /api/listings` and both listings show in `GET /api/listings` and on the page — all live, in under 30 seconds.

**Tech stack**
Zero-dependency Node.js server (web UI + JSON API), Solana/Anchor USDC escrow spec'd in-repo, built with Claude Code + Cursor.
