# Track D — The Human Door

**Area:** Web experience + business development
**Status:** Working feature brief
**Owner:** Unassigned
**Last updated:** 2026-08-06
**Product:** Agent Tickets

## 1. Purpose

Track D turns Agent Tickets into a product normal ticket buyers and sellers can understand, trust, and use without knowing Solana, USDC, wallets, or AI-agent APIs. It also creates the business operating system needed to acquire legitimate ticket supply and obtain approval from payment and onramp partners.

The human door and the agent door must use the same inventory and marketplace rules. The human experience may hide protocol complexity, but it must not make guarantees that the underlying program, payment provider, or support operation cannot honor.

## 2. Problem

The current demo proves that a human or an agent can create a listing and see it appear in a shared browser-local inventory. It does not yet prove that:

- inventory is real, authorized, transferable, or durable;
- buyers and sellers can complete a transaction;
- a ticket was delivered or accepted;
- money can legally and reliably move from card or wallet to seller;
- refunds, chargebacks, disputes, cancellations, and event changes are handled;
- organizers have a reason to provide supply or endorse the marketplace;
- users can recover from failure without understanding the underlying chain.

Some current UI copy is ahead of implementation. Card payment, Crossmint conversion, automatic transfer detection, refunds, and escrow release are shown as if they work, while the repository describes them as designed or preview-only. Correcting that gap is a launch requirement.

### 2.1 Current implementation baseline

Track D starts from a polished Next.js demo, not a functioning marketplace:

- `/`, `/listings`, `/buy`, `/trust`, and `/api` are human-visible pages.
- Listings exist only in browser `localStorage`; different users and devices do not share inventory, and clearing storage removes it.
- The documented `GET /api/listings` and `POST /api/listings` endpoints are not implemented. The API playground writes to the same browser-local store.
- The buy flow changes a local status flag; it does not connect a wallet, submit an escrow transaction, charge a card, transfer a ticket, confirm receipt, or issue a refund.
- Phantom/wallet packages are installed but not wired into the application.
- The Anchor program and integration tests are not present, and the MCP server is a stub.
- The current listing schema lacks seller identity, quantity, seat details, transfer method, ownership evidence, and durable lifecycle state.
- Demo prices use JavaScript `number` values and whole USDC. Production money must use integer base units.
- Empty, loading, persistence-failure, not-found, invalid listing ID, edit, withdrawal, sold, and recovery states are incomplete or absent.
- An invalid `/buy?id=` currently falls back to another listing instead of showing a safe not-found state.

This baseline is the acceptance starting point. Marketing copy or a browser-only simulation must never be counted as implementation of the corresponding capability.

## 3. Outcomes

### User outcomes

- A buyer can find a relevant ticket, understand the full price and protections, pay using an approved method, receive the ticket, and know what to do if anything goes wrong.
- A seller can prove ownership, understand payout timing and obligations, list a transferable ticket, deliver it, and track settlement.
- A non-crypto user can complete the happy path without acquiring crypto knowledge.
- A wallet user can choose USDC without being forced through a fiat flow.
- Both parties see one consistent order status and an auditable timeline.

### Business outcomes

- Stripe and Crossmint receive a complete, accurate application packet with no undisclosed marketplace, escrow, crypto, or third-party seller activity.
- The team can determine which provider architecture is actually supportable before building around it.
- Conference organizers can onboard verified inventory through a repeatable partner process.
- Supply acquisition, conversion, fulfillment, fraud, and support can be measured from the first pilot.

### Non-goals for the first pilot

- Mainnet or real-fund operation before explicit legal, provider, security, and product approval.
- International launch.
- Guaranteed authenticity without an organizer or ticketing-platform verification mechanism.
- Automated dispute adjudication before dispute policy and evidence standards are approved.
- Native ticket issuance or venue access control.

## 4. Product principles

1. **Plain language first.** Say “card,” “ticket,” “protected payment,” and “payout.” Explain USDC only where it matters.
2. **No false certainty.** Never say “verified,” “guaranteed,” “automatic,” or “refunded” unless the exact mechanism is live and its limitations are disclosed.
3. **Price before commitment.** Show ticket price, marketplace fee, card/onramp fee, network fee, taxes, seller proceeds, and refundability before payment.
4. **One order truth.** Web, API, support tools, and on-chain state must map to the same order state machine.
5. **Progressive trust.** Apply stronger identity, ownership, velocity, and payout controls as risk increases.
6. **Provider approval before integration assumptions.** Stripe, Crossmint, banks, and card networks decide what they will support.
7. **Organizer-aligned supply.** Prefer authorized, transferable inventory over anonymous high-risk resale.
8. **Devnet means simulation.** Demo states must be visibly labeled and must not imply that real funds or production protection exist.

## 5. Personas

### Buyer

- Knows the event, date, city, price range, or section they want.
- May have no wallet and no knowledge of USDC.
- Needs confidence in authenticity, transferability, total price, delivery timing, and refund rules.
- May be buying for another attendee or as part of a group.

### Seller

- Has a transferable ticket and wants a fair, predictable payout.
- May be an attendee, sponsor, organizer, exhibitor, or authorized inventory partner.
- Needs to know what proof is required, when to transfer, and when funds become available.

### Organizer or supply partner

- Wants more legitimate attendance, controlled resale, and fewer scams.
- Needs brand protection, inventory controls, reporting, escalation, and possibly price or transfer rules.

### Support and risk operator

- Needs a queue of orders requiring action, evidence, deadlines, provider references, and an immutable event history.

### Crypto-native user

- Wants a direct wallet and USDC path with minimal abstraction and transparent network state.

## 6. Scope

### 6.0 Committed delivery boundary

**Track D commitment:** complete D0 and D1. D2 and D3 are follow-on phases gated by written provider approval and the launch gates in Section 19.

Track D is complete when the truthful human-facing demo, canonical event/listing model, simulated buyer and seller lifecycle, organizer acquisition system, provider supportability packet, support runbooks, and pilot measurement plan are delivered. Track D does not include real card capture, real USDC settlement, production KYC, or seller payout.

The document intentionally describes D2 and D3 so early choices do not block them; their presence is not authorization to build or launch them.

### 6.1 Public website

- Home page with a buyer-first value proposition.
- Browse and search with filters for event, location, date, price, quantity, section, listing type, and verification level.
- Event detail pages that group inventory by event instead of treating every listing as unrelated text.
- Listing detail page with seller/partner status, ticket attributes, delivery method, restrictions, all-in price, and protection summary.
- Trust and safety pages describing what is live, what is not, dispute rules, prohibited listings, and payment handling.
- Organizer landing page with partnership benefits and lead form.
- Help center, contact path, legal terms, privacy notice, refund/cancellation policy, prohibited-items policy, and accessibility statement.
- Explicit devnet/demo banner until production is approved.

### 6.2 Human buyer flow

1. Discover an event.
2. Select a listing and quantity.
3. Review ticket attributes and transfer restrictions.
4. Sign in or continue with the approved identity model.
5. Select card or USDC when available.
6. See an all-in quote with an expiration time.
7. Accept terms and refund/dispute policy.
8. Complete payment or wallet signature.
9. Receive an order confirmation and seller delivery deadline.
10. Receive and inspect the ticket.
11. Confirm receipt or raise an issue.
12. Receive final status and receipt.

For a group purchase, the buyer remains financially responsible while each ticket has a named recipient and independent transfer/acceptance status. The order cannot be marked fully delivered until every included ticket reaches its required delivery state. Third-party recipients receive only the minimum order data and must accept the applicable ticketing-platform and event terms.

### 6.3 Human seller flow

1. Create an account and complete required verification.
2. Select or create the event from canonical event data.
3. Enter ticket details: quantity, section/row/seat where applicable, ticket type, restrictions, face value where required, delivery method, and transfer deadline.
4. Prove ownership using an approved evidence method.
5. Review pricing guidance, prohibited behavior, fees, payout timing, tax considerations, and organizer rules.
6. Publish, edit, pause, or withdraw the listing while allowed.
7. Receive notice that an active listing has sold and transfer the exact ticket before the deadline.
8. Submit delivery evidence without exposing ticket barcodes publicly.
9. Respond to buyer issues within the service-level target.
10. Receive payout or a clear reason for hold, refund, or review.

The proposed default is an instant-commit listing: publishing authorizes a sale at the stated terms, so the seller does not get a second acceptance step after funding. If organizers require seller acceptance, it must be a separate listing mode with an authorization hold, explicit response deadline, and automatic release when declined or expired.

### 6.4 Account and order center

- Passwordless sign-in initially; passkeys can follow.
- Buyer orders, seller listings, payouts, verification status, saved events, notification preferences, and support cases.
- Status timeline with timestamps and plain-language next actions.
- Email required for critical notifications; SMS and push are later channels.
- Session management, account recovery, data export, and account deletion.

### 6.5 Business operations

- Payment/onramp provider applications and architecture review.
- Organizer prospecting, outreach, qualification, contracting, onboarding, and reporting.
- Risk and support console.
- Incident, complaint, dispute, and provider-escalation procedures.
- Pilot reporting and partner business reviews.

## 7. Information architecture

### Public

- `/` — value proposition and current product status
- `/events` — searchable event catalog
- `/events/[event]` — event details and grouped inventory
- `/listings/[listing]` — listing details
- `/sell` — seller education and listing start
- `/organizers` — supply partnership page
- `/trust` — protections, limitations, and order lifecycle
- `/help` — help center
- `/legal/*` — terms, privacy, refunds, prohibited listings, cookies
- `/status` — incidents and degraded services

### Signed in

- `/account/orders`
- `/account/listings`
- `/account/payouts`
- `/account/verification`
- `/account/settings`
- `/support/[case]`

### Internal

- `/ops/orders`
- `/ops/listings`
- `/ops/risk`
- `/ops/disputes`
- `/ops/partners`

Internal routes require role-based access, audit logging, and strong authentication. They must never depend on obscurity.

## 8. Core domain model

### Event

- Canonical name, venue, local start time, timezone, organizer, age restrictions, accessibility details, transfer policy, cancellation source, and status.

### Listing

- Event ID, seller ID, quantity, split rules, section/row/seat, ticket type, delivery method, transfer deadline, restrictions, price in integer base units, currency, verification level, source, and status.

### Order

- Buyer, seller, listing snapshot, quote snapshot, provider references, escrow reference, fulfillment deadline, status, timestamps, and support/dispute references.

### Evidence

- Type, uploader, order/listing reference, secure object reference, checksum, redaction status, access history, and retention/deletion date.

Ticket barcodes, PDFs, identity documents, and payment details are sensitive. They must not be stored in logs, analytics payloads, public URLs, or client-side local storage.

## 9. Order and listing states

### Listing states

`draft → pending_verification → active → reserved → sold`

Alternative exits:

- `draft | pending_verification | active → withdrawn`
- `pending_verification | active → rejected`
- `active | reserved → expired`
- `active | reserved → suspended`
- `reserved → active` when a quote or payment attempt expires safely

### Order states

`quote_created → payment_pending → funded → delivery_pending → delivered → receipt_confirmed → released`

Alternative branches:

- `quote_created | payment_pending → expired`
- `payment_pending → failed`
- `funded → seller_cancelled → refund_pending → refunded`
- `delivery_pending → delivery_missed → review`
- `delivered → issue_raised → review`
- `review → released | partial_refund | refund_pending`
- Any non-terminal state may enter `risk_hold` or `provider_hold` with an operator-visible reason.

State rules:

- The server-side order service owns state transitions; clients request actions but cannot declare success.
- Provider webhooks and chain observations are inputs. They are deduplicated, ordered, reconciled, and retained with provider references.
- `risk_hold` and `provider_hold` preserve the prior state. Exit requires an authorized operator or authoritative provider event and returns to that prior state or a documented refund/review state.
- `partial_refund` is terminal only after refunded and released amounts reconcile to the funded total, including an explicit fee treatment.
- A listing becomes `sold` only when its order is authoritatively funded. Failed or expired payment returns a safe reservation to `active`.
- Multi-ticket orders track fulfillment per ticket; the aggregate order state is derived from those items.
- Post-release chargebacks, post-payout refunds, seller negative balances, and provider/ledger mismatches are financial exceptions. They create a case and receivable/reserve entry; they must never rewrite immutable chain history or silently debit another order.

Timeout behavior is a product and program decision, not just a timer. The team must decide what happens when the buyer is silent, when the seller supplies disputed evidence, when only part of an order is delivered, and when an event date is near. No timeout may release real funds until that decision is implemented in both policy and program behavior.

### Human and agent rule parity

- Human and agent callers use the same canonical event IDs, listing validation, reservation lock, quote expiry, idempotency rules, inventory availability, order states, and rate-limit policy.
- Source identity is recorded for audit and UX, but it cannot grant inventory priority.
- A single atomic reservation operation decides human/agent collisions; the loser receives an unavailable response and cannot proceed with a stale quote.
- Agent-specific receipt confirmation remains unresolved in Section 20.

## 10. Experience requirements

### Browse and discovery

- Canonical events prevent duplicate spellings from fragmenting inventory.
- Search tolerates misspellings and supports city, venue, performer, conference, and date.
- Filters are reflected in the URL and work with keyboard and screen readers.
- Empty states suggest nearby dates, waitlists, or organizer-requested supply.
- Sold, reserved, expired, and cancelled inventory cannot appear purchasable.
- Display local event time and timezone; warn users browsing from another timezone.

### Listing quality

- Require quantity and delivery method.
- Support general admission, assigned seating, multi-day passes, VIP/add-ons, and accessible seating without misrepresenting them as equivalent.
- Prevent public barcode or QR uploads.
- Detect duplicate ticket identifiers or evidence reuse.
- Disclose obstructed view, age limits, entry windows, lead-attendee requirements, transfer locks, ID matching, and companion-seat rules.
- Make face-value disclosure configurable by jurisdiction and organizer policy.

### Checkout

- Reserve inventory for a short, visible period.
- Revalidate availability and price before funding.
- Use idempotency keys so retries cannot create duplicate orders or charges.
- Never mark an order funded from a client redirect alone; verify provider webhooks and/or chain finality.
- Show the payer, seller, asset, network, total fees, expected delivery, and refund rules before consent.
- Provide accessible loading, retry, pending, declined, cancelled, and unknown-result states.
- Recover safely after tab close, wallet rejection, provider redirect, webhook delay, RPC failure, or network interruption.

### Fulfillment

- Prefer organizer/ticket-platform transfer integrations when available.
- Otherwise require structured delivery instructions and evidence.
- Buyer confirmation must identify what is being confirmed and warn if confirmation is irreversible.
- A buyer-reported issue pauses release only if the on-chain design and policy support it.
- Do not claim the blockchain proves ticket delivery; it only proves blockchain events.

### Notifications

- Order placed, payment pending, funded, seller action required, transfer sent, deadline approaching, issue raised, resolved, refund initiated, refund completed, payout initiated, and payout completed.
- Every message includes order ID, event, next action, deadline/timezone, and support path.
- Notification delivery failure is visible to operations and does not silently change contractual deadlines.

### Accessibility and localization

- Target WCAG 2.2 AA.
- Full keyboard navigation, visible focus, semantic forms, error summaries, sufficient contrast, reduced-motion support, and screen-reader status announcements.
- Store money as integer base units; format at display boundaries.
- Store event timestamps with timezone. Do not infer venue timezone from the buyer's browser.
- Internationalization-ready strings even if the pilot is US English only.

## 11. Trust, safety, and abuse coverage

### Seller and inventory controls

- Email/phone verification before publishing.
- Identity and payout verification before higher limits or payout.
- Ownership evidence proportional to risk.
- New-seller listing and value limits.
- Delayed or reviewed payout for elevated-risk transactions.
- Duplicate, manipulated screenshot, barcode exposure, stolen-account, and impossible-inventory checks.
- Organizer allowlist/blocklist and event-level restrictions.

### Buyer and payment controls

- Payment provider fraud tooling plus marketplace velocity and device signals.
- Card authorization/capture timing aligned with delivery and refund rules.
- Wallet screening and sanctions controls where legally/provider required.
- Rate limits on quotes, checkout, login, support, and promo mechanisms.
- Protection against enumeration of users, orders, listings, or evidence URLs.

### Marketplace abuse

- Speculative listings without ownership.
- Counterfeit or already-used tickets.
- Same ticket listed on multiple marketplaces.
- Seller transfers a different seat or date.
- Buyer falsely claims non-delivery.
- Seller or buyer account takeover.
- Wash transactions, self-dealing, money movement disguised as ticket sales, and collusion.
- Price manipulation, bot hoarding, spam inventory, scraping, denial of inventory, and abusive agent callers.
- Prohibited events or tickets, sanctions exposure, minors, and jurisdiction-specific resale restrictions.

### Data and security

- Minimize personal data; Crossmint-hosted KYC is preferred for evaluation because it avoids handling identity documents directly.
- Encrypt sensitive data in transit and at rest.
- Separate public product data, private order data, payment metadata, identity data, and evidence.
- Role-based access, least privilege, audit logs, secret management, webhook signature verification, dependency scanning, and incident response.
- Define retention and deletion periods before collecting evidence or identity information.

## 12. Disputes, refunds, and event changes

These policies must be decided before real-money launch.

### Minimum reason codes

- Ticket not received.
- Transfer received but cannot be accepted.
- Wrong event/date/seat/quantity.
- Invalid, duplicated, revoked, or already-used ticket.
- Materially undisclosed restriction.
- Event cancelled, postponed, relocated, or rescheduled.
- Buyer changed mind.
- Seller cannot fulfill.
- Payment duplicated or charged but order status unknown.
- Suspected account takeover or unauthorized payment.

### Evidence

- Provider and chain records.
- Ticket-platform transfer confirmation.
- Organizer confirmation.
- Timestamped communications.
- Redacted ticket metadata.
- Venue denial evidence when available.

### Required policy decisions

- Whether V1 has disputes or relies only on timeout.
- Who can pause release and under what authority.
- Evidence standard and decision owner.
- Response deadlines and event-date emergency handling.
- Partial refunds for partial quantity or seat mismatch.
- Treatment of postponement versus cancellation.
- Allocation of card chargeback loss.
- Whether marketplace fees, network fees, and onramp fees are refundable.
- Appeal path and finality.

## 13. Payments and onramp workstream

### Architecture decision to validate

The current UI says “Stripe checkout, converted to USDC via Crossmint.” That may not be a valid or approved architecture. Stripe and Crossmint should be evaluated as distinct provider paths unless both providers explicitly approve the combined flow.

Candidate paths:

1. **USDC only:** buyer funds the devnet escrow from a Solana wallet.
2. **Crossmint Onramp:** buyer purchases USDC into a wallet, then separately funds escrow.
3. **Crossmint Checkout:** only if Crossmint confirms that an off-chain event ticket backed by this escrow and secondary marketplace model is supported.
4. **Stripe Connect marketplace:** card payment and seller payout through Stripe, with no crypto settlement in the card path.
5. **Approved hybrid:** only with written confirmation covering merchant of record, seller onboarding, escrow, card-to-stablecoin conversion, refunds, disputes, and chargebacks.

### Stripe application packet — prepare today

- Legal business name, entity type, formation jurisdiction, address, tax ID, owners/controllers, bank account, and support contacts.
- Public website with accurate product description, contact information, pricing/fees, terms, privacy, refunds, fulfillment, and prohibited-listing policies.
- Clear statement that this is a peer-to-peer secondary event-ticket marketplace.
- Funds flow showing buyer, platform, seller, Stripe, any wallet/onramp, escrow account, refund path, and payout timing.
- Explanation of who is merchant of record and whether Stripe Connect connected accounts are used.
- Seller onboarding, identity, inventory verification, fraud, dispute, and chargeback controls.
- Expected launch geography, currencies, average/maximum order value, monthly volume, refund rate, and delivery timeline.
- Explicit disclosure of Solana, USDC, on-chain escrow, and any Crossmint role.
- Request written guidance on supportability and the correct Stripe product architecture.

Stripe lists payment facilitation/aggregation, escrow services, cryptocurrency services, and other financial services as restricted categories requiring additional due diligence or sales contact. The application must not hide or soften those facts.

### Crossmint application packet — prepare today

- The same corporate, website, policy, volume, geography, and funds-flow materials.
- Requested product: Onramp, Checkout, or both; do not use the terms interchangeably.
- Asset/network details, including devnet status and intended production asset.
- Whether users bring wallets or receive embedded wallets.
- Who performs end-user KYC and who stores identity data.
- Seller settlement model, secondary-sale model, escrow contract behavior, refund path, and chargeback allocation.
- Request confirmation that off-chain event tickets, peer-to-peer secondary sales, and the proposed escrow architecture are supported.
- Request pricing, limits, supported countries/states, production timeline, KYB requirements, webhook behavior, sandbox behavior, and support escalation.

Crossmint documentation says production access requires a signed order form and KYB. Its Onramp requires end-user KYC and is for wallet funding, while Checkout is for purchasing a specific supported asset or product. This distinction must drive the architecture.

### Questions for both providers

1. Is secondary event-ticket resale supported?
2. Is the platform, provider, seller, or escrow program the merchant/seller of record?
3. Must each seller complete KYC/KYB?
4. Can funds be held pending off-chain ticket delivery?
5. Who carries card fraud and chargeback risk?
6. How are refunds performed after fiat has become USDC?
7. Can a dispute or risk review pause settlement?
8. What transaction, geography, event-type, and seller limits apply?
9. Are payouts to self-custody wallets supported?
10. What website policies and licenses are required before approval?
11. Which webhook events are authoritative?
12. What reserve, rolling hold, or minimum-volume terms apply?

## 14. Organizer supply workstream

### Initial target profile

- Independently run conferences with 500–5,000 attendees.
- Transferable digital tickets.
- Clear organizer ownership and reachable decision-maker.
- Meaningful last-minute no-show, waitlist, sponsor, speaker, or exhibitor inventory.
- No exclusive ticketing contract that prohibits the pilot.
- US-based pilot while legal and provider scope is being established.

### Organizer value propositions

- A safer official alternative to resale in Slack, Discord, email threads, and social DMs.
- Waitlist conversion and recovered attendance.
- Organizer-approved transfer rules and price caps.
- Verified event page and trusted inventory badge.
- Reporting on demand, resale, fulfillment, and fraud.
- Optional charity or community allocation if later approved.
- Agent-readable inventory without forcing organizers to build an API.

### Partnership offer for pilot

- No setup fee.
- Small, bounded event and seller cohort.
- Organizer approval before any “official” or “verified” language.
- Manual inventory review and named escalation contact.
- Shared launch checklist and incident plan.
- Post-event report and review.

Do not promise zero fees, guaranteed authenticity, chargeback immunity, or automatic refunds until those are contractually and technically true.

### Outreach sequence

**Day 0**

- Build a list of 25 conferences in the next 60–180 days.
- Find event owner, operations lead, ticketing lead, partnerships lead, and community lead.
- Score fit based on date, size, transferability, waitlist, community resale activity, and decision-maker access.

**Day 1**

- Send ten personalized emails.
- Send five warm-introduction requests.
- Contact five organizers through official partnership forms.
- Record consent/source and avoid bulk unsolicited messaging.

**Day 3**

- Follow up with one concrete pilot concept tailored to their event.

**Day 7**

- Send a final concise follow-up and close the sequence unless they engage.

### Outreach email

**Subject:** Safer ticket transfers for [Conference] attendees

Hi [Name],

Attendees who can no longer make [Conference] often resell through DMs and community channels, where neither side has much protection. We are building Agent Tickets, a marketplace for organizer-approved ticket transfers with shared inventory for people and AI assistants.

We would like to run a small pilot for [Conference]: verified event details, organizer-defined transfer rules, manual listing review, and a direct escalation path for your team. The goal is to recover legitimate attendance without creating an uncontrolled resale channel.

Would you be open to a 20-minute conversation about your current transfer, waitlist, and unused-allocation process? We will not present the marketplace as official or use your marks without written approval.

Thanks,
[Name]
[Role]
[Contact]
[Website]

### Discovery questions

1. How are cancellations, transfers, and waitlists handled today?
2. Which ticketing platform and contract governs transfers?
3. Are names, IDs, lead-attendee rules, or approval required?
4. Where does unofficial resale happen?
5. What fraud or support cases occur most often?
6. Are sponsor, speaker, exhibitor, or community allocations left unused?
7. Would the organizer allow resale, face-value-only transfer, or a price cap?
8. What data or operational control would be required?
9. Who approves brand use, ticketing changes, legal terms, and data sharing?
10. What would make a pilot successful or unacceptable?

### Partner pipeline

`identified → researched → contacted → replied → discovery → qualified → legal/security review → pilot agreed → onboarding → live → post-event review`

Required CRM fields:

- Organization, event, dates, city, size, ticketing platform, transfer rules, exclusive-contract risk, contacts, source, last touch, next action, stage, objections, owner, and notes.

## 15. Operations and support

### Support channels

- In-product case creation tied to order ID.
- Email fallback.
- Event-day emergency queue for access-critical cases.
- No support decisions through social DMs.

### Initial service targets

- Payment/order-status incident: acknowledge within 30 minutes during pilot coverage.
- Event within 24 hours: acknowledge within 30 minutes.
- Active delivery issue: acknowledge within 2 hours.
- General question: one business day.

These are proposed targets, not public commitments, until staffing and coverage are assigned.

### Runbooks required

- Payment succeeded but order not funded.
- Order funded but listing unavailable.
- Seller misses transfer deadline.
- Buyer cannot accept transfer.
- Duplicate charge or duplicate order.
- Provider webhook delayed or replayed.
- Chain/RPC degraded or transaction remains uncertain.
- Event cancelled, postponed, or venue changed.
- Account takeover.
- Barcode or identity data exposure.
- Organizer requests listing removal.
- Provider freezes account or reserves funds.
- Widespread incident near event start.

## 16. Analytics and success metrics

### North-star pilot metric

**Safely fulfilled orders:** orders where the correct ticket was accepted before the event and funds reached the correct terminal state without an unresolved support case.

### Funnel

- Event page views.
- Listing-detail views.
- Checkout starts.
- Quotes created.
- Payments initiated.
- Payments funded.
- Tickets delivered.
- Receipt confirmed.
- Payout released.

### Marketplace

- Active events and listings.
- Verified/partner-supplied share.
- Sell-through rate.
- Time to first listing and sale.
- Median price versus disclosed face value where available.
- Cancellation, expiration, and duplicate-listing rates.

### Trust and operations

- Delivery success before deadline.
- Dispute, refund, and chargeback rates.
- Fraud loss and prevented-loss rate.
- Time to acknowledge and resolve.
- Event-day failure rate.
- Support contacts per order.

### Partner

- Outreach-to-reply, reply-to-discovery, discovery-to-pilot, and pilot-to-repeat conversion.
- Organizer-sourced listings and fulfilled orders.
- Organizer satisfaction and reported fraud reduction.

Every event must include a stable event name, order/listing ID where applicable, source, timestamp, environment, and schema version. Analytics must exclude ticket barcodes, identity data, wallet secrets, full addresses, and unredacted support evidence.

## 17. Edge-case coverage matrix

### Discovery and listing

- No listings, stale listings, duplicate events, duplicate tickets, malformed dates, past events, timezone/DST boundaries, cancelled events, postponed events, venue changes, multi-day passes, bundles, parking/add-ons, accessible seats, restricted transfer, delayed ticket release, lead-booker rules, under-18 events, and seller edits after reservation.

### Inventory concurrency

- Two buyers choose the same ticket, buyer abandons checkout, payment completes after reservation expiry, seller withdraws during checkout, partial quantity purchase, and cross-channel agent/human purchase collision.

### Payment

- Card declined, 3DS/step-up required, wallet rejected, insufficient funds, quote expires, fee changes, provider timeout, redirect lost, webhook duplicated/out of order, chain transaction dropped/reorged, RPC disagreement, duplicate click, idempotent retry, charge succeeds but UI fails, refund fails, payout held, chargeback after seller payout, refund after release, seller negative balance, and provider/internal/on-chain ledger mismatch.

### Fulfillment

- Seller transfers early/late, transfer email typo, buyer lacks ticket-platform account, buyer cannot accept, wrong seat/quantity, ticket rotates barcode, ticket becomes available only near event, transfer revoked, event starts before review, buyer silent, seller silent, and platform outage.

### Trust and legal

- Stolen account, stolen card, stolen ticket, fabricated evidence, duplicate marketplace listing, sanctions match, minor, deceased/incapacitated user, subpoena/law-enforcement request, data deletion during active dispute, organizer takedown, trademark complaint, and jurisdictional resale cap.

### Recovery

- Browser closes, device changes, email inaccessible, wallet changes, account recovery, notification bounced, provider account frozen, key compromise, database restore, analytics outage, chain congestion, and total provider outage.

Each case needs an owner, detection method, user message, allowed state transition, automated action, manual action, deadline, evidence, and audit record before production.

### P0 outcomes required before a paid pilot

- **Double purchase:** exactly one atomic reservation can win; every other attempt fails before capture.
- **Charged, funding unknown:** mark payment as pending, block resale and payout, reconcile asynchronously, and never ask the buyer to pay again until the first attempt is resolved.
- **Partial multi-ticket delivery:** keep item-level states, release/refund only according to the approved partial-fulfillment policy, and show each recipient's status.
- **Seller misses deadline:** stop release, open review, notify both parties, and follow the approved refund/extension rule.
- **Buyer is silent:** follow the approved timeout policy; the product must not invent a client-side default.
- **Wrong or invalid ticket:** pause any pausable release, secure evidence, apply the dispute decision, and notify organizer/provider when required.
- **Chargeback after payout:** create a loss/receivable case, apply the approved reserve or recovery policy, and do not silently seize unrelated seller funds.
- **Refund after on-chain release:** route to manual financial exception handling; no refund is promised until the funding source and loss owner are identified.
- **Ledger mismatch:** stop affected payouts, preserve evidence, reconcile provider, internal, and chain records, and escalate by severity.
- **Provider freeze or outage:** disable new affected checkouts, preserve existing order states, publish accurate status, and use the provider escalation path.
- **Event cancelled or postponed:** freeze new sales and apply the approved event-change policy to every affected order.
- **Account or barcode compromise:** suspend affected inventory/orders, revoke sessions or exposed artifacts where possible, notify impacted users, and execute the incident runbook.

All other listed cases must be converted into a tracked requirement with the same outcome fields or explicitly accepted as a pre-production risk by the accountable owner.

## 18. Phased delivery

### Phase D0 — Truthful demo

- Keep all transactions on devnet/simulated data.
- Add persistent demo labeling.
- Remove or qualify unsupported claims in buy and trust flows.
- Implement empty, loading, error, not-found, invalid-ID, and storage/persistence-failure states.
- Stop invalid buy URLs from silently selecting a different listing.
- Make human forms and the agent playground call one shared validation contract; label the playground simulated until real route handlers exist.
- Replace browser-local inventory with an environment-appropriate shared backend before claiming cross-user or agent-visible inventory.
- Use integer USDC base units in any non-demo data contract; whole-number JavaScript prices remain explicitly demo-only.
- Add seller-facing post-publish next steps and buyer/seller status views for the simulated lifecycle.
- Instrument the browse/list demo.
- Publish organizer and provider information pages.

### Phase D1 — Supply pilot without real settlement

- Canonical event pages and richer listing schema.
- Organizer CRM and outreach.
- Manual seller/inventory verification.
- Reservations and simulated order lifecycle.
- Support queue and runbooks.
- User interviews and organizer discovery.

### Phase D2 — Approved limited payment pilot

- Only after provider, legal, security, and program decisions are complete.
- One geography, bounded events, transaction limits, approved sellers, manual risk review, and staffed support.
- Real provider webhooks, reconciliation, refunds, payout controls, monitoring, and incident response.

### Phase D3 — Scaled human marketplace

- Broader self-service supply.
- Organizer integrations.
- Improved search, recommendations, waitlists, and notification channels.
- Automated risk controls with human review and measurable appeal paths.

## 19. Launch gates

No real-money pilot until all are true:

- Provider gives written approval for the disclosed business and funds flow.
- Legal review covers ticket resale, marketplace terms, privacy, consumer protection, money movement, tax reporting, and launch jurisdictions.
- Every launch-blocking decision in Section 20 is decided, recorded, and reflected in product, policy, operations, and program behavior.
- On-chain program is deployed only to the approved environment and has passed required testing/security review.
- Payment, escrow, order, and refund reconciliation is tested.
- Support and incident coverage is staffed.
- Organizer or supply authorization is documented.
- High-risk copy has been reviewed against actual behavior.
- Accessibility and core end-to-end tests pass.
- Rollback, provider freeze, and chain/RPC outage plans are rehearsed.

## 20. Decisions required

The repository explicitly leaves these questions open; Track D must not silently choose:

1. **Disputes:** Does V1 include a dispute path, or is timeout the only remedy?
2. **Agent receipt:** When an agent buys, does the agent or its human operator confirm receipt?
3. **Fee model:** What is the take rate, who pays it, and is it collected in-program or off-chain?

Additional Track D decisions:

4. Pilot country/state and legal entity.
5. Provider architecture: USDC, Crossmint Onramp, Crossmint Checkout, Stripe Connect, or an explicitly approved hybrid.
6. Merchant/seller of record and seller onboarding model.
7. Ticket ownership verification standard.
8. Organizer-authorized supply only versus broader peer-to-peer listings.
9. Payout timing, reserves, and risk holds.
10. Event cancellation/postponement policy.
11. Support coverage and decision authority.
12. Whether buyer confirmation can be reversed or challenged.
13. Card chargeback loss after seller payout, seller reserves, negative balances, and recovery rights.
14. Refund treatment after on-chain release and allocation of non-refundable provider/network fees.
15. Partial fulfillment and partial refund rules for multi-ticket orders.
16. Identity and consent rules when the payer buys for other attendees.
17. Reservation duration, seller cancellation rights, and whether any listing mode requires seller acceptance.
18. Authoritative ledger and reconciliation process across provider, internal, and chain records.
19. Data retention/deletion rules for identity, ticket evidence, support cases, and active disputes.

Decisions 1 and 3–19 are launch blocking. Decision 2 is additionally blocking for agent purchases.

## 21. Immediate action plan

### Today — mandatory

“Apply today” means opening truthful supportability/KYB conversations and completing every application field that can be answered accurately. It does not mean guessing unresolved corporate, legal, funds-flow, or product answers. Record every blocked field and its owner.

- [ ] **Track D lead:** assign named provider and organizer owners. **Done:** names, contact details, and decision authority are recorded at the top of this document or in the project tracker.
- [ ] **Web owner:** correct application-facing copy to distinguish live demo behavior from planned settlement. **Done:** every card, refund, transfer, escrow, and protection claim has evidence or a demo/planned label.
- [ ] **Payments owner:** create one-page funds-flow diagrams for USDC-only, Crossmint Onramp, Crossmint Checkout, and Stripe Connect candidates. **Done:** each names merchant/seller of record, custody, KYC, chargeback, refund, payout, and fee paths.
- [ ] **Company owner:** assemble corporate, beneficial-owner, bank, support, policy, estimated volume, geography, and risk-control information. **Done:** packet is complete or every missing field has a named owner and date.
- [ ] **Payments owner:** contact Stripe sales/compliance and start the application with full marketplace, escrow, crypto, and third-party seller disclosure. **Done:** case/application ID, submitted answers, missing items, and next action are saved.
- [ ] **Payments owner:** create a Crossmint staging account and send a production supportability/KYB request describing the off-chain ticket, secondary-sale, and escrow model. **Done:** account/workspace ID, request ID, submitted answers, and next action are saved.
- [ ] **Payments owner:** send both providers the questions in Section 13. **Done:** dated written responses are attached to the architecture decision; verbal answers are marked non-authoritative.
- [ ] **Partnerships owner:** choose a provisional discovery profile—US independent conferences, 500–5,000 attendees, 60–180 days out, transferable digital tickets. **Done:** deviations are documented; this is research targeting, not a launch-jurisdiction decision.
- [ ] **Partnerships owner:** create 25 researched organizer records. **Done:** each has fit evidence, decision-maker, contact source, transfer platform/rules if known, and next action.
- [ ] **Partnerships owner:** send five highly personalized discovery emails after the public site is truthful. **Done:** messages, consent/source, timestamps, and follow-up dates are recorded. Do not claim an approved payment pilot or official partnership.
- [ ] **Partnerships owner:** create the partner CRM and schedule Day 3/Day 7 follow-ups. **Done:** no contacted lead lacks an owner or next action.

### Next 72 hours

- [ ] Draft terms, privacy, refund/cancellation, prohibited-listing, and dispute-policy decision documents.
- [ ] Interview at least three organizers and five buyers/sellers.
- [ ] Choose one narrow pilot event profile.
- [ ] Define the listing and order schemas and state-transition ownership.
- [ ] Turn every edge case in Section 17 into a tracked requirement or accepted risk.
- [ ] Establish pilot support hours, escalation contacts, and incident channel.

### Before implementation commits

- [ ] Resolve contradictions between README scope and current preview UI.
- [ ] Confirm which claims and flows are demo-only.
- [ ] Break Track D into independently testable tickets with acceptance criteria.
- [ ] Keep payment-provider secrets, identity data, and keypairs out of the repository.

## 22. Acceptance criteria

Track D is ready for a limited pilot plan when:

- A new user can explain the product, price, protection, limitations, and next step after reading the website.
- All public claims map to implemented behavior or are clearly labeled as planned/demo.
- Buyer and seller happy paths and every terminal order state are specified.
- The edge-case matrix has an owner and disposition for each case.
- Provider supportability and architecture are documented in writing.
- At least one qualified organizer has completed discovery and reviewed the pilot concept.
- Legal, support, risk, security, accessibility, analytics, reconciliation, and incident requirements have named owners.
- No path can transact on mainnet or with real funds until the launch gates are explicitly approved.

## 23. Source notes

Research checked on 2026-08-06:

- [Stripe — Prohibited and Restricted Businesses](https://stripe.com/legal/restricted-businesses): restricted categories include payment facilitation/aggregation, escrow services, cryptocurrency services, and other financial services, subject to additional due diligence and availability.
- [Crossmint Payments](https://docs.crossmint.com/payments/introduction): production Checkout access requires an order form and KYB; Checkout and Onramp serve different use cases.
- [Crossmint Onramp](https://docs.crossmint.com/onramp/overview): production access requires an order form and KYB; end-user limits and geographic availability apply.
- [Crossmint User Onboarding and KYC](https://docs.crossmint.com/onramp/introduction/user-onboarding): Onramp users complete KYC, either through Crossmint-hosted collection or data supplied by the platform.

Provider documentation and policies change. Recheck the definitive terms and obtain written approval before relying on any architecture or claim.
