# Escrow Integration Guide (Track B)

**Program:** `agent_tickets_escrow` · **Program ID:** `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`
**Source of truth:** `programs/escrow/src/lib.rs` (Anchor 0.31.1). Design rationale: `docs/superpowers/specs/2026-08-06-agent-tickets-design.md` §5.
**Status:** written against the scaffold commit `edeacb9`. Everything below is read off the program, not the spec — where the two disagree, this document follows the program and says so.

This is the contract the backend codes against: what to derive, what to send, what can fail, and what comes back on the event stream.

---

## 1. Constants

| Name | Value | Meaning |
|---|---|---|
| `GRACE_BEFORE_EVENT_SECS` | `7_200` (2h) | Delivery must finish at least 2h before doors. |
| `GRACE_AFTER_EVENT_SECS` | `21_600` (6h) | Inspection may run at most 6h past doors. |
| `BPS_DENOMINATOR` | `10_000` | Fee basis-point denominator. |

All timestamps are **absolute Unix seconds** (`i64`) taken from the on-chain `Clock` — never durations, never client wall-clock. All USDC amounts are **base units** (6 dp): `$100.00 == 100_000_000`.

---

## 2. PDA derivations

| Account | Seeds | Notes |
|---|---|---|
| `Config` | `["config"]` | Singleton. There is exactly one config for the whole program — see §9. |
| `Listing` | `["listing", seller_pubkey, listing_id_le]` | `listing_id` is a **client-generated `u64` nonce**, serialized little-endian (8 bytes). Address is precomputable before the tx lands → use it as your idempotency key. |
| `Order` | `["order", listing_pubkey, buyer_pubkey]` | One order per (listing, buyer) pair, ever. A retried buy re-inits an existing account and fails deterministically. |
| `vault` | *not a program PDA* | The **associated token account** of `usdc_mint` owned by the **Order PDA**. Derive with `getAssociatedTokenAddressSync(usdcMint, orderPda, /* allowOwnerOffCurve */ true)`. The Order PDA is the token authority; the program signs vault transfers with the order seeds. |

TypeScript:

```ts
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

const listingPda = (seller: PublicKey, id: bigint) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), seller.toBuffer(),
     Buffer.from(new Uint8Array(new BigUint64Array([id]).buffer))], // u64 LE
    programId
  )[0];

const orderPda = (listing: PublicKey, buyer: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("order"), listing.toBuffer(), buyer.toBuffer()], programId
  )[0];

const vaultAta = (usdcMint: PublicKey, order: PublicKey) =>
  getAssociatedTokenAddressSync(usdcMint, order, true);
```

---

## 3. Account state

### `Config` (PDA `["config"]`)

| Field | Type | Notes |
|---|---|---|
| `authority` | `Pubkey` | Only signer that may `update_config`. |
| `arbiter` | `Pubkey` | Snapshotted onto every Order at lock time. |
| `fee_bps` | `u16` | ≤ `10_000`. Fee is taken **at release, never at lock**. |
| `fee_destination` | `Pubkey` | Wallet; the fee **token account** must be owned by it. |
| `usdc_mint` | `Pubkey` | Every token account in every instruction is checked against this. |
| `delivery_window_secs` | `i64` | > 0. |
| `inspection_window_secs` | `i64` | > 0. |
| `paused` | `bool` | Gates `create_listing` and `lock_purchase` **only** (see §9). |
| `bump` | `u8` | |
| `_reserved` | `[u8; 128]` | |

### `Listing` (PDA `["listing", seller, listing_id_le]`)

| Field | Type | Notes |
|---|---|---|
| `seller` | `Pubkey` | |
| `listing_id` | `u64` | Client nonce; also part of the seed. |
| `price` | `u64` | USDC base units. In data, never in seeds — price is mutable-by-design later. |
| `event_hash` | `[u8; 32]` | `hash(name\|venue\|start_ts)`; opaque to the program. |
| `event_start_ts` | `i64` | The universal backstop both clocks clamp to. |
| `qty` | `u16` | ≥ 1. Not enforced against anything else in V1 — one listing sells once. |
| `status` | `ListingStatus` | `Active \| Locked \| Settled \| Cancelled`. |
| `delivery_commit` | `[u8; 32]` | Zeroed in V1 (reserved for commit-reveal). |
| `metadata_uri` | `String` | **max 96 bytes** (`#[max_len(96)]`). Longer strings blow the account size and the tx fails at `init`. |
| `created_ts` | `i64` | |
| `bump` / `_reserved` | `u8` / `[u8; 64]` | |

### `Order` (PDA `["order", listing, buyer]`)

| Field | Type | Notes |
|---|---|---|
| `listing` | `Pubkey` | |
| `buyer` / `seller` | `Pubkey` | `seller` copied from the listing at lock. |
| `amount` | `u64` | Snapshot of `listing.price` at lock. |
| `fee_bps` | `u16` | **Snapshotted at lock** — a later `update_config` never reprices a live order. |
| `state` | `OrderState` | `Locked \| Delivered \| Released \| Refunded \| Disputed \| ArbiterResolved`. |
| `locked_ts` | `i64` | |
| `delivery_deadline` | `i64` | Set at lock. |
| `inspection_deadline` | `i64` | **`0` until `mark_delivered`.** Do not render it before the order reaches `Delivered`. |
| `arbiter` | `Pubkey` | Snapshotted from config at lock. |
| `attestation` | `Pubkey` | `Pubkey::default()` in V1 (SAS later). |
| `bump` / `_reserved` | `u8` / `[u8; 64]` | |

> **Indexing rule.** The terminal statuses are never observable on chain. Every settling instruction closes the `Order` (and usually the `Listing`) in the same transaction that sets the state, so `Settled`/`Cancelled`/`Released`/`Refunded`/`ArbiterResolved` exist only inside that transaction. **Build the projection off events, never off account polling** — a poller sees a live account, then nothing, and cannot tell "released" from "refunded".

---

## 4. Instruction reference

Legend: **S** = must sign. Anchor 0.31 resolves `system_program`, `token_program`, `associated_token_program` and other well-known programs automatically when you use `.accounts({...})`; they are listed for completeness.

### 4.1 `initialize_config(fee_bps: u16, delivery_window_secs: i64, inspection_window_secs: i64)`

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | init | PDA `["config"]`, payer = authority |
| `authority` | ✅ | ✅ | Becomes `config.authority` |
| `arbiter` | | | Unchecked; stored |
| `fee_destination` | | | Unchecked; stored |
| `usdc_mint` | | | Must be a valid mint |
| `system_program` | | | |

**Preconditions:** `fee_bps ≤ 10000`; both windows `> 0`; config must not already exist.
**Errors:** `InvalidFee`, `InvalidWindow`, or a raw Anchor `AccountAlreadyInitialized` (0x0) on re-init.
**Emits:** nothing.

### 4.2 `update_config(fee_bps: Option<u16>, delivery_window_secs: Option<i64>, inspection_window_secs: Option<i64>, arbiter: Option<Pubkey>, paused: Option<bool>)`

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | ✅ | PDA `["config"]`, `has_one = authority` |
| `authority` | ✅ | | Must equal `config.authority` |

Pass `null` for any field you are not changing. `fee_destination` and `usdc_mint` are **not** updatable.
**Preconditions:** `fee_bps ≤ 10000`, windows `> 0` when supplied.
**Errors:** `InvalidFee`, `InvalidWindow`, `ConstraintHasOne` (wrong authority).
**Emits:** nothing — the backend must record config changes itself.

### 4.3 `create_listing(listing_id: u64, price: u64, event_hash: [u8;32], event_start_ts: i64, qty: u16, metadata_uri: String)`

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | init | PDA `["listing", seller, listing_id_le]`, payer = seller |
| `seller` | ✅ | ✅ | Pays rent; becomes `listing.seller` |
| `system_program` | | | |

**Preconditions:** `!config.paused`; `price > 0`; `qty ≥ 1`; **`event_start_ts > now + 7200`** (event strictly more than 2h out); `metadata_uri` ≤ 96 bytes; the listing PDA must not already exist.
**Result:** `status = Active`, `delivery_commit` zeroed, `created_ts = now`.
**Errors:** `MarketPaused`, `InvalidPrice`, `InvalidQty`, `EventTooSoon`.
**Emits:** `ListingCreated`.

### 4.4 `cancel_listing()`

| Account | S | Mut | Constraint |
|---|---|---|---|
| `listing` | | ✅ close→seller | PDA re-derived from `seller` + `listing.listing_id`; `has_one = seller` |
| `seller` | ✅ | ✅ | Receives rent |

**Preconditions:** `listing.status == Active`. A listing with a live order is `Locked` and cannot be cancelled — the seller must use `cancel_purchase` instead.
**Errors:** `ListingNotActive`, `ConstraintHasOne`/seeds mismatch if a non-seller signs.
**Emits:** `ListingCancelled`. The account is closed, rent returns to the seller.

### 4.5 `lock_purchase()` — the buy

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | ✅ | Any `Listing` of this program |
| `order` | | init | PDA `["order", listing, buyer]`, payer = buyer |
| `buyer` | ✅ | ✅ | Pays rent + price |
| `buyer_token` | | ✅ | `owner == buyer`, `mint == config.usdc_mint` |
| `vault` | | init | ATA(`usdc_mint`, authority = `order`), payer = buyer |
| `usdc_mint` | | | `address == config.usdc_mint` |
| `token_program`, `associated_token_program`, `system_program` | | | |

**Preconditions:** `!config.paused`; `listing.status == Active`; the computed `delivery_deadline > now`; buyer holds ≥ `listing.price`.

```
delivery_deadline = min(now + config.delivery_window_secs, listing.event_start_ts − 7200)
```

**Result:** listing → `Locked`; order created in state `Locked` with `amount = listing.price`, `fee_bps = config.fee_bps`, `arbiter = config.arbiter`, `inspection_deadline = 0`; `price` USDC moves buyer → vault via `transfer_checked`.
**Errors:** `MarketPaused`, `ListingNotActive` (the double-buy loser — surface as HTTP 409), `EventTooSoon` (event now inside the 2h grace), `InvalidTokenAccount`, `InvalidMint`, `MathOverflow`, plus SPL insufficient-funds.
**Emits:** `PurchaseLocked`.

### 4.6 `mark_delivered()` — seller asserts delivery

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | | `listing.key() == order.listing` |
| `order` | | ✅ | `order.seller == seller.key()` |
| `seller` | ✅ | | |

**Preconditions:** `order.state == Locked`; **`now ≤ order.delivery_deadline`**.

```
inspection_deadline = min(now + config.inspection_window_secs, listing.event_start_ts + 21600)
```

**Result:** order → `Delivered`.
**Errors:** `InvalidState` (not `Locked` — includes already-delivered and disputed), `DeadlinePassed`, `ListingMismatch`, `UnauthorizedSeller`.
**Emits:** `DeliveryMarked`.

> `mark_delivered` does **not** check `config.paused`. Pausing the market stops new listings and new buys; it never traps money already in escrow. That is deliberate.

### 4.7 `confirm_receipt()` — buyer releases

Uses the shared **`Settle`** account context (§4.8 table).
**Preconditions:** `authority` signer **must equal `order.buyer`**; `order.state ∈ {Locked, Delivered}` (a buyer may release early, before the seller has even marked delivery).
**Errors:** `UnauthorizedBuyer`, `InvalidState`, plus the `Settle` context errors.
**Emits:** `OrderReleased { to_seller, fee }`.

### 4.8 `timeout_release()` — permissionless

Same **`Settle`** context. **Anyone may sign** — `authority` is unchecked on this path.

| Account (`Settle`) | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | ✅ close→seller | `listing.key() == order.listing` |
| `order` | | ✅ close→buyer | PDA `["order", listing, order.buyer]` |
| `authority` | ✅ | | Checked `== order.buyer` by `confirm_receipt` only |
| `buyer` | | ✅ | `address == order.buyer`; receives order + vault rent |
| `seller` | | ✅ | `address == order.seller`; receives listing rent |
| `vault` | | ✅ | ATA(`usdc_mint`, authority = `order`) |
| `seller_token` | | ✅ | `owner == order.seller`, `mint == config.usdc_mint` |
| `fee_token` | | ✅ | `owner == config.fee_destination`, `mint == config.usdc_mint` |
| `usdc_mint` | | | `address == config.usdc_mint` |
| `token_program` | | | |

**Preconditions:** `order.state == Delivered` **and** `now > order.inspection_deadline`. A never-delivered order can never reach this path.
**Errors:** `InvalidState`, `DeadlineNotReached`, `ListingMismatch`, `InvalidTokenAccount`, `InvalidMint`.
**Emits:** `OrderReleased`.

**Payout math (shared by `confirm_receipt`, `timeout_release`, and `resolve_dispute(PaySeller)`):**

```
fee       = floor(order.amount * order.fee_bps / 10_000)   // u128 intermediate
to_seller = order.amount − fee
```

The fee transfer is **skipped entirely when `fee == 0`** — at `fee_bps = 0` exactly one transfer instruction appears in the CPI log, and `fee_token` is untouched (but still required in the account list). Then: listing → `Settled` + closed to seller, order → `Released` + closed to buyer, vault closed with rent to **buyer**.

### 4.9 `timeout_refund()` — permissionless

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | ✅ close→seller | `listing.key() == order.listing` |
| `order` | | ✅ close→buyer | PDA `["order", listing, order.buyer]` |
| `buyer` | | ✅ | `address == order.buyer` |
| `seller` | | ✅ | `address == order.seller` |
| `vault` | | ✅ | ATA(`usdc_mint`, authority = `order`) |
| `buyer_token` | | ✅ | `owner == order.buyer`, `mint == config.usdc_mint` |
| `usdc_mint` | | | `address == config.usdc_mint` |
| `token_program` | | | |

No signer beyond the fee payer — this is the crank. **Preconditions:** `order.state == Locked` and `now > order.delivery_deadline`.
**Result:** listing → `Cancelled` (closed to seller), order → `Refunded` (closed to buyer), **full `order.amount` back to the buyer, no fee taken**.
**Errors:** `InvalidState`, `DeadlineNotReached`, `ListingMismatch`, `InvalidTokenAccount`, `InvalidMint`.
**Emits:** `OrderRefunded { reason: DeliveryTimeout }`.

### 4.10 `cancel_purchase()` — seller-initiated mutual unwind

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | ✅ (**not** closed) | `listing.key() == order.listing` |
| `order` | | ✅ close→buyer | PDA `["order", listing, order.buyer]` |
| `seller` | ✅ | | `order.seller == seller.key()` |
| `buyer` | | ✅ | `address == order.buyer`; receives refund + rent |
| `vault` | | ✅ | ATA(`usdc_mint`, authority = `order`) |
| `buyer_token` | | ✅ | `owner == order.buyer`, `mint == config.usdc_mint` |
| `usdc_mint` | | | `address == config.usdc_mint` |
| `token_program` | | | |

**Preconditions:** `order.state ∈ {Locked, Delivered}`. Not available once `Disputed`.
**Result:** **the listing goes back to `Active` and stays open** — this is the only instruction that relists. The order is refunded in full and closed; the same buyer can buy again (the order PDA was closed, so re-init succeeds), and so can anyone else.
**Errors:** `InvalidState`, `UnauthorizedSeller`, `ListingMismatch`, `InvalidTokenAccount`, `InvalidMint`.
**Emits:** `OrderRefunded { reason: SellerCancelled }`.

### 4.11 `open_dispute()`

| Account | S | Mut | Constraint |
|---|---|---|---|
| `order` | | ✅ | Any `Order` of this program |
| `buyer` | ✅ | | Must equal `order.buyer` |

**Preconditions:** `order.state ∈ {Locked, Delivered}`.
**Result:** order → `Disputed`. **No clock is mutated** — `delivery_deadline` and `inspection_deadline` keep their values. The freeze is a consequence of the state guards: `timeout_release` needs `Delivered`, `timeout_refund` needs `Locked`, `confirm_receipt` needs `Locked|Delivered`, `cancel_purchase` needs `Locked|Delivered`. Once `Disputed`, **every** path except `resolve_dispute` reverts with `InvalidState`, no matter how far past either deadline the clock runs.
**Errors:** `UnauthorizedBuyer`, `InvalidState`.
**Emits:** `DisputeOpened`.

> Two consequences for the backend. (a) `open_dispute` takes no `config` and no listing, and has **no deadline check** — a buyer can dispute after `inspection_deadline` has passed, so a late dispute races a `timeout_release` crank; slot order decides and both outcomes are legitimate. Report whichever landed. (b) A `Disputed` order has **no timeout at all**: only the arbiter can move it. Alert on `escrow_stuck_count` for orders sitting in `Disputed`.

### 4.12 `resolve_dispute(ruling: DisputeRuling)`

| Account | S | Mut | Constraint |
|---|---|---|---|
| `config` | | | PDA `["config"]` |
| `listing` | | ✅ close→seller | `listing.key() == order.listing` |
| `order` | | ✅ close→buyer | PDA `["order", listing, order.buyer]` |
| `arbiter` | ✅ | | Must equal **`order.arbiter`** (the snapshot), not `config.arbiter` |
| `buyer` | | ✅ | `address == order.buyer` |
| `seller` | | ✅ | `address == order.seller` |
| `vault` | | ✅ | ATA(`usdc_mint`, authority = `order`) |
| `buyer_token` | | ✅ | `owner == order.buyer`, `mint == config.usdc_mint` |
| `seller_token` | | ✅ | `owner == order.seller`, `mint == config.usdc_mint` |
| `fee_token` | | ✅ | `owner == config.fee_destination`, `mint == config.usdc_mint` |
| `usdc_mint` | | | `address == config.usdc_mint` |
| `token_program` | | | |

Both `buyer_token` and `seller_token` and `fee_token` are required **regardless of ruling** — build one account set and pick the ruling at the last moment.

| Ruling | Anchor arg | Listing | Order | Money |
|---|---|---|---|---|
| `PaySeller` | `{ paySeller: {} }` | `Settled`, closed → seller | `ArbiterResolved`, closed → buyer | `to_seller` + `fee` per §4.8 math; vault rent → buyer |
| `RefundBuyer` | `{ refundBuyer: {} }` | `Cancelled`, closed → seller | `ArbiterResolved`, closed → buyer | full `amount` → buyer, **no fee**; vault rent → buyer |

**Preconditions:** signer == `order.arbiter`; `order.state == Disputed`.
**Errors:** `UnauthorizedArbiter`, `InvalidState`, `ListingMismatch`, `InvalidTokenAccount`, `InvalidMint`, `MathOverflow`.
**Emits:** `DisputeResolved { ruling }`. Note it does **not** also emit `OrderReleased`/`OrderRefunded` — an indexer that only watches those two events will miss every arbitrated settlement.

---

## 5. State machines

### Listing

```
                       create_listing
                             │
                             ▼
   cancel_listing ◀────── [Active] ◀───────── cancel_purchase
   (closes acct)             │                      ▲
                             │ lock_purchase        │
                             ▼                      │
                         [Locked] ───────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │ confirm_receipt    │ timeout_refund     │ resolve_dispute
        │ timeout_release    │                    │
        │ resolve(PaySeller) │                    │ (RefundBuyer)
        ▼                    ▼                    ▼
    [Settled]            [Cancelled]          [Cancelled]
   closed → seller      closed → seller      closed → seller
```

`Active → Locked → Active` (via `cancel_purchase`) is the only cycle. Every other exit closes the account.

### Order

```
                    lock_purchase
                         │
                         ▼
                     [Locked] ──── now > delivery_deadline ────▶ timeout_refund ─▶ [Refunded]✝
                      │  │  │
     mark_delivered ──┘  │  └── cancel_purchase ─▶ [Refunded]✝
     (now ≤ delivery_     │
      deadline)           └── confirm_receipt ─▶ [Released]✝
                         │
                         ▼
                    [Delivered] ── now > inspection_deadline ──▶ timeout_release ─▶ [Released]✝
                      │  │  │
     confirm_receipt ──┘  │  └── cancel_purchase ─▶ [Refunded]✝
                         │
        open_dispute (buyer, from Locked or Delivered)
                         │
                         ▼
                    [Disputed] ── resolve_dispute ──▶ [ArbiterResolved]✝
                    (no timeout exists here)

✝ terminal — the Order account is closed in the same transaction.
```

Who may act, at a glance:

| From | Instruction | Signer | Clock condition |
|---|---|---|---|
| `Locked` | `mark_delivered` | seller | `now ≤ delivery_deadline` |
| `Locked` | `confirm_receipt` | buyer | none |
| `Locked` | `timeout_refund` | **anyone** | `now > delivery_deadline` |
| `Locked` | `cancel_purchase` | seller | none |
| `Locked` | `open_dispute` | buyer | none |
| `Delivered` | `confirm_receipt` | buyer | none |
| `Delivered` | `timeout_release` | **anyone** | `now > inspection_deadline` |
| `Delivered` | `cancel_purchase` | seller | none |
| `Delivered` | `open_dispute` | buyer | none |
| `Disputed` | `resolve_dispute` | `order.arbiter` | none |

---

## 6. The two clocks

The whole point (§5.3 of the design doc): **one timer is exploitable in both directions.** A seller who never delivers must not be paid by buyer silence; a silent buyer must not be able to grief an honest seller. So delivery is an explicit on-chain assertion that separates two clocks.

**Clock 1 — delivery.** Set at `lock_purchase`:

```
delivery_deadline = min(now + config.delivery_window_secs, event_start_ts − 2h)
```

Lapsing it opens the **refund** path, permissionlessly. `lock_purchase` refuses outright if this computes to a value `≤ now` (`EventTooSoon`) — which is also why `create_listing` requires `event_start_ts > now + 2h`: a listing that could never be bought must not exist.

**Clock 2 — inspection.** Set at `mark_delivered`, and only there:

```
inspection_deadline = min(now + config.inspection_window_secs, event_start_ts + 6h)
```

Lapsing it opens the **release** path, permissionlessly. Before `mark_delivered`, `inspection_deadline == 0`; treat 0 as "not started", not as "expired in 1970".

**`event_start_ts` clamps both.** All escrow activity is bounded to `[event_start − 2h, event_start + 6h]` no matter how the config windows are set. Tickets self-expire. Practical consequence for the backend: for a near-term event the effective windows are much shorter than `config.*_window_secs`, so **always read `delivery_deadline` / `inspection_deadline` off the Order** — never recompute them from the config windows client-side.

**Design for the timeout path as the default, not the fallback.** A rational adversarial buyer never clicks confirm. `timeout_release` is the market's normal settlement. Our crank should be the reliable instance of a job anyone can run; if it stops, settlement still works.

---

## 7. Errors

Anchor custom errors start at 6000; the number is what you get back over RPC as `custom program error: 0x<hex>`.

| Code | Hex | Name | Message | When you'll actually see it |
|---|---|---|---|---|
| 6000 | 0x1770 | `MarketPaused` | Marketplace is paused | `create_listing` / `lock_purchase` while `config.paused` |
| 6001 | 0x1771 | `InvalidFee` | Fee must be <= 10000 bps | config init/update |
| 6002 | 0x1772 | `InvalidWindow` | Window must be positive | config init/update |
| 6003 | 0x1773 | `InvalidPrice` | Price must be > 0 | `create_listing` |
| 6004 | 0x1774 | `InvalidQty` | Quantity must be >= 1 | `create_listing` |
| 6005 | 0x1775 | `ListingNotActive` | Listing is not active | **double-buy loser → HTTP 409**; `cancel_listing` on a locked listing |
| 6006 | 0x1776 | `InvalidState` | Order is not in a valid state for this action | every wrong-state transition, incl. anything on a `Disputed` order |
| 6007 | 0x1777 | `EventTooSoon` | Event starts too soon for the escrow window | `create_listing` < 2h out; `lock_purchase` inside the grace |
| 6008 | 0x1778 | `DeadlineNotReached` | Deadline has not been reached yet | crank fired early |
| 6009 | 0x1779 | `DeadlinePassed` | Deadline has already passed | `mark_delivered` after `delivery_deadline` |
| 6010 | 0x177a | `UnauthorizedBuyer` | Signer is not the order's buyer | `confirm_receipt`, `open_dispute` |
| 6011 | 0x177b | `UnauthorizedSeller` | Signer is not the order's seller | `mark_delivered`, `cancel_purchase` |
| 6012 | 0x177c | `UnauthorizedArbiter` | Signer is not the configured arbiter | `resolve_dispute` |
| 6013 | 0x177d | `ListingMismatch` | Listing does not match order | wrong listing account passed |
| 6014 | 0x177e | `InvalidTokenAccount` | Invalid token account | wrong owner/mint on any ATA; also wrong `buyer`/`seller` rent recipient |
| 6015 | 0x177f | `InvalidMint` | Invalid mint | mint ≠ `config.usdc_mint` |
| 6016 | 0x1780 | `MathOverflow` | Math overflow | deadline arithmetic, fee math |

You will also hit **framework** errors that are not in this table and need their own mapping: `AccountNotInitialized` (2003-ish family) when a PDA doesn't exist yet, `ConstraintSeeds` / `ConstraintHasOne` / `ConstraintAddress`, `AccountAlreadyInitialized` (0x0) on a re-init — the last one is the **chain-level idempotency signal** for a retried `create_listing` or `lock_purchase`: map it to "here is your existing listing/order", not to a 500.

---

## 8. Events

Subscribe to program logs and decode with the Anchor `EventParser` / `program.addEventListener`. Events are the projection source of record (§3).

| Event | Fields | Emitted by |
|---|---|---|
| `ListingCreated` | `listing: Pubkey`, `seller: Pubkey`, `listing_id: u64`, `price: u64`, `event_hash: [u8;32]`, `event_start_ts: i64` | `create_listing` |
| `ListingCancelled` | `listing: Pubkey`, `seller: Pubkey` | `cancel_listing` |
| `PurchaseLocked` | `order: Pubkey`, `listing: Pubkey`, `buyer: Pubkey`, `amount: u64`, `delivery_deadline: i64` | `lock_purchase` |
| `DeliveryMarked` | `order: Pubkey`, `inspection_deadline: i64` | `mark_delivered` |
| `OrderReleased` | `order: Pubkey`, `to_seller: u64`, `fee: u64` | `confirm_receipt`, `timeout_release` |
| `OrderRefunded` | `order: Pubkey`, `amount: u64`, `reason: RefundReason` | `timeout_refund` (`DeliveryTimeout`), `cancel_purchase` (`SellerCancelled`) |
| `DisputeOpened` | `order: Pubkey` | `open_dispute` |
| `DisputeResolved` | `order: Pubkey`, `ruling: DisputeRuling` | `resolve_dispute` |

Gaps to code around, deliberately, today:

- **`OrderReleased` / `OrderRefunded` carry no `listing` and no `buyer`/`seller`.** Join on `order` against your own `PurchaseLocked` row. If your indexer starts mid-history it will see releases for orders it never saw locked — backfill from `PurchaseLocked` first, and drop release events for unknown orders into a dead-letter table rather than silently ignoring them.
- **`resolve_dispute` emits only `DisputeResolved`.** Money moved, but no `OrderReleased`/`OrderRefunded` accompanies it. Treat `DisputeResolved` as a settlement event and derive amounts from the ruling + the stored `amount`/`fee_bps`.
- **`update_config` and `initialize_config` emit nothing.** Record config mutations from the transaction itself if you need an audit trail.
- **`cancel_purchase` emits `OrderRefunded` but no "listing relisted" event.** The listing goes back to `Active` silently — re-read the listing account (or infer it from the refund reason) or your search index will keep showing it sold.
- Enums decode as `{ deliveryTimeout: {} }` / `{ sellerCancelled: {} }` / `{ paySeller: {} }` / `{ refundBuyer: {} }` in the TS client.

Commitment ladder, as a rule: **render at `confirmed`; release funds, reveal deliverables, or pay out only at `finalized`.**

---

## 9. Operational notes for Track B

1. **`Config` is a singleton per program deployment.** Seeds are `["config"]` with no discriminator — one config, one USDC mint, one fee, one arbiter for the whole program. Two environments sharing a program ID share a config. It also means two independent test suites cannot both call `initialize_config` against the same validator (see the header of `tests/escrow-edge.test.ts`).
2. **`paused` is not a kill switch for live orders.** It blocks `create_listing` and `lock_purchase` only. Delivery, confirmation, timeouts, disputes and refunds all keep working while paused — by design: we may veto new business, never trap funds. Keep it that way; it is the FinCEN control-test posture from design doc §12.
3. **Fees are snapshotted at lock.** Changing `config.fee_bps` never repriced a live order. Show the buyer `order.fee_bps`, not the config's.
4. **All-in price.** `order.amount` is what the buyer pays, full stop — the fee comes out of the seller's side at release. The quoted all-in total for a buyer is `listing.price`.
5. **Rent flows** (matters for a wallet-balance UI): listing rent → seller on every close; order rent → buyer; vault rent → buyer on every path including `PaySeller`.
6. **`metadata_uri` is capped at 96 bytes.** Store the real metadata off-chain and put a short pointer here; validate the length at the API edge or the transaction fails at `init` with an opaque serialization error.
7. **Missing ATAs.** The vault is created inside `lock_purchase`. `seller_token`, `buyer_token` and `fee_token` are **not** — create them idempotently (`createAssociatedTokenAccountIdempotent`) in the same transaction as the settling instruction, or the crank will fail on a seller who closed their USDC account.
8. **The crank.** Run one job that scans for `state == Locked && now > delivery_deadline` → `timeout_refund`, and `state == Delivered && now > inspection_deadline` → `timeout_release`. Both are permissionless, so the fee payer can be any hot wallet with SOL; it needs no authority over the funds. Expect `DeadlineNotReached` and `InvalidState` as ordinary races — retry-safe, log at debug, not error.
9. **`timeout_refund` has no universal `event_start_ts` backstop.** Design doc §5.2 item 8 describes a second trigger ("`now > event_start_ts` in any non-terminal state"); the shipped program does **not** implement it — the only refund trigger is `state == Locked && now > delivery_deadline`. In practice the clamps make the two nearly coincide (`delivery_deadline ≤ event_start − 2h`), and a `Delivered` order still resolves via `timeout_release` at `event_start + 6h` at the latest. The one genuinely stuck state is `Disputed`, which has no timeout. Flag it in monitoring; it is an instruction-add, not a migration, if we want it.
