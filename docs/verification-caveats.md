# Verification Caveats & Limitations

Read this before shipping document verification to users or agents. These are hard boundaries — not bugs.

## What verification DOES

- Reads proof-of-purchase documents (email confirmations, mobile tickets, PDFs, receipts)
- Extracts structured fields via **Google Gemini Vision** (event, date, venue, order ID)
- Cross-checks extracted data against the seller's listing
- Returns `verified`, `needs_review`, or `rejected` with confidence score and flags

## What verification DOES NOT do

| Limitation | Why it matters |
|------------|----------------|
| **Not proof of ownership at transfer time** | A receipt proves someone bought a ticket, not that they still have it or haven't sold it twice |
| **Not cryptographic proof** | Screenshots and PDFs can be edited. We flag obvious tampering but cannot guarantee authenticity |
| **Not barcode/QR validation** | We don't scan barcodes against Ticketmaster or venue systems |
| **Not KYC / identity verification** | We don't verify who the seller is |
| **Not legal compliance** | Resale may violate platform ToS or local laws — out of scope for V1 |
| **Not on-chain** | Verification status does not write to Solana. Escrow is a separate layer |

## Fraud vectors we cannot fully prevent (V1)

1. **Duplicate listings** — Same order confirmation used for multiple listings. Mitigation: dedupe on `orderId` before publish.
2. **Edited screenshots** — Photoshop/Figma fakes. Mitigation: human review on `needs_review`, tamper flags.
3. **Screenshot of a screenshot** — Common scam pattern. Mitigation: vision flags + manual review.
4. **Sell elsewhere after listing** — Seller lists here, sells on StubHub too. Mitigation: on-chain escrow + transfer confirmation (next phase).

## Gemini-specific caveats

- **API key required** — Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Keep it server-side only.
- **Rate limits** — Free tier has quotas. Enable billing for production volume.
- **Model accuracy** — Blurry, cropped, or dark images reduce extraction quality. Reject or flag low-confidence results.
- **PDF support** — Multi-page or password-protected PDFs may fail. Prefer single-page screenshots for V1.
- **Cost** — Gemini Flash is cheap/free at low volume; monitor usage as you scale.

## Operational rules (enforce in product)

1. **`needs_review` → block listing** — Do not auto-publish until a human approves.
2. **Do not persist raw images** — Process, extract, discard. Store only verification metadata + redacted fields.
3. **Dedupe order IDs** — Reject listings if the same `orderId` was used before.
4. **Show disclaimer in UI** — Every upload flow must display the verification disclaimer.
5. **Server-side only** — Never call Gemini from the browser; always go through `POST /api/verify`.

## Disclaimer (show to users)

> Document verification is proof-of-purchase assistance only. It does not guarantee ticket validity at the venue, prevent double-selling, or replace on-chain escrow.

## Recommended flow before blockchain

```
1. Seller uploads proof document
2. Gemini extracts fields → validator runs
3. If verified/needs_review → hold listing as "pending verification"
4. Human approves needs_review cases
5. Only then → allow listing to go live
6. Later: buyer USDC escrow → seller transfer → release
```

See also: [document-verification.md](./document-verification.md)
