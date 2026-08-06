# Agent-Tickets

**Product name + one-liner**
Agent-Tickets — a peer-to-peer marketplace for buying and selling event tickets, with funds held in Solana escrow, that AI agents can buy and sell on directly.

**Problem**
Resale platforms like StubHub charge 20-30% in combined fees and pay sellers out days later, while buyers have no real guarantee the ticket is valid until they're at the door. There's also no way for an AI shopping agent to actually complete a ticket purchase today — every platform requires a human clicking through a checkout flow.

**Solution**
Sellers list a ticket and price in USDC; buyer funds lock into an on-chain Solana escrow program instead of going straight to the seller. Funds release to the seller automatically when the buyer confirms receipt (or after a timeout), cutting fees and payout delay versus incumbents. The same list/buy flow is exposed through a public API and MCP server, so an AI agent can search listings and complete a purchase without a human in the loop.

**Core features (V1)**
- List a ticket for sale (event name, date, price in USDC)
- Browse/search live listings on the web
- Buy a ticket: funds lock into a Solana escrow smart contract on purchase
- Buyer-confirm releases escrow to seller (or auto-releases after a timeout)
- MCP/API endpoint so an agent can list available tickets and execute a purchase end-to-end

**Out of scope**
- Native NFT ticket issuance and venue/door verification
- Fiat onramp for non-crypto users (wallet + USDC only tonight)
- Dispute resolution / arbitration for bad-faith claims
- Mobile apps
- KYC, sanctions screening, and other regulatory compliance flows

**Success criteria**
On stage: list a mock ticket from wallet A, then have an AI agent (via the MCP/API) autonomously find and buy it from wallet B — USDC moves into the on-chain escrow and releases to the seller, confirmed on Solana devnet, in under 60 seconds.

**Tech stack**
Next.js + Vercel, Anchor/Solana (devnet) escrow program, Phantom wallet adapter, MCP server for agent access, built in Cursor.
