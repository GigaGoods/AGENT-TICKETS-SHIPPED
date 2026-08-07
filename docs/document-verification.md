# Document Verification

Before on-chain escrow, sellers must prove they actually purchased the ticket they're listing. This module handles that off-chain verification step using a vision API to read proof-of-purchase documents.

## Supported document types

| Type | Example | Required fields |
|------|---------|-----------------|
| `email_confirmation` | Ticketmaster / Eventbrite email screenshot | event name, date, order ID |
| `mobile_ticket` | Apple Wallet or venue app screenshot | event name, date |
| `pdf_ticket` | Downloaded PDF ticket | event name, date |
| `order_receipt` | Checkout / order history screenshot | event name, order ID |

## How it works

```
Seller uploads proof doc
        ↓
Vision API extracts structured fields (event, date, venue, order ID, etc.)
        ↓
Validator cross-checks extracted data against the listing
        ↓
Result: verified | rejected | needs_review
```

## File layout

```
verification/
  types.js              — Core types (VerificationResult, ExtractedTicketFields, etc.)
  document-types.js     — Supported doc types and required fields
  prompts.js            — Vision API extraction prompts
  validator.js          — Cross-check extracted fields vs listing
  service.js            — Main orchestrator (upload → extract → validate)
  vision/
    provider.js         — Provider factory (swap OpenAI ↔ Google)
    providers/
      openai-vision.js  — OpenAI GPT-4o Vision (optional alternative)
      google-vision.js  — Google Gemini Vision (default)
app/api/verify/
  route.ts              — POST /api/verify (Next.js route handler)
config.js               — Reads env vars
verification/caveats.js — Caveats returned with every verification result
docs/verification-caveats.md — Full limitations & fraud vectors
.env.example            — API key template
```

## Vision API — do you need an API key?

**Yes.** Every cloud vision/LLM provider requires an API key. Your key stays server-side only — never expose it in frontend code.

### Default: Google Gemini Vision

1. Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Copy `.env.example` → `.env` and set:

```bash
VISION_PROVIDER=google
GOOGLE_API_KEY=your-key-here
GOOGLE_VISION_MODEL=gemini-flash-latest
```

**Why Gemini:** Free tier for development, strong document/screenshot understanding, native JSON output, and no separate OCR pipeline needed.

**Caveats:** See [verification-caveats.md](./verification-caveats.md) for fraud vectors, rate limits, and operational rules.

### Alternative: OpenAI Vision

1. Create an account at [platform.openai.com](https://platform.openai.com)
2. Go to [API Keys](https://platform.openai.com/api-keys) and create a key
3. Set in `.env`:

```bash
VISION_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_VISION_MODEL=gpt-4o
```

**Cost:** Roughly $0.01–0.05 per document depending on image size and model.

### Other options (not yet implemented)

| Provider | API key from | Best for |
|----------|-------------|----------|
| AWS Textract | AWS IAM credentials | High-volume PDF OCR |
| Azure Document Intelligence | Azure portal | Enterprise doc parsing |
| Anthropic Claude Vision | console.anthropic.com | Same use case as OpenAI |

Adding a new provider: create a file in `verification/vision/providers/`, implement the `extract()` method, and register it in `provider.js`.

## API usage

Served by the Next.js app (`npm run dev`), and used by the "List a ticket" flow on `/listings`:

```bash
POST /api/verify
Content-Type: application/json

{
  "documentBase64": "<base64-encoded image or PDF>",
  "mimeType": "image/png",
  "listingId": "listing-123",
  "listing": {
    "eventName": "Taylor Swift",
    "eventDate": "2026-09-15",
    "venue": "MetLife Stadium",
    "priceUsdc": 250,
    "ticketCount": 2
  }
}
```

**Response:**

```json
{
  "ok": true,
  "verification": {
    "id": "uuid",
    "status": "verified",
    "documentType": "email_confirmation",
    "confidence": 0.91,
    "extracted": {
      "eventName": "Taylor Swift | The Eras Tour",
      "eventDate": "2026-09-15",
      "venue": "MetLife Stadium",
      "platform": "Ticketmaster",
      "orderId": "12-34567/NY2"
    },
    "fieldMatches": [
      { "field": "eventName", "matched": true },
      { "field": "eventDate", "matched": true },
      { "field": "venue", "matched": true }
    ],
    "flags": [],
    "provider": "google",
    "disclaimer": "Document verification is proof-of-purchase assistance only...",
    "activeWarnings": [],
    "caveats": [ { "id": "proof_of_purchase_only", "severity": "critical", "message": "..." } ],
    "verifiedAt": "2026-08-06T23:00:00.000Z"
  }
}
```

## Verification statuses

| Status | Meaning |
|--------|---------|
| `verified` | Document matches listing with high confidence |
| `needs_review` | Partial match or quality flags — human should check |
| `rejected` | Document doesn't match listing or confidence too low |
| `pending` | Not yet processed |

## Security notes

- Store API keys in `.env`, never in code or git
- Process documents server-side only (Gemini calls must never run in the browser)
- Don't persist raw document images longer than needed for verification
- `needs_review` results should block listing publication until a human approves
- This is **proof-of-purchase**, not proof-of-transfer — a seller could still sell the same ticket twice off-platform. On-chain escrow solves that next.

## Caveats

Every verification response includes a full caveat list and disclaimer. See [verification-caveats.md](./verification-caveats.md) for the complete limitations, fraud vectors, and operational rules.

## Next steps (blockchain)

Once verification passes, the listing can proceed to the Solana USDC escrow layer:
1. Seller uploads proof → `verified`
2. Buyer deposits USDC into escrow
3. Seller transfers ticket → buyer confirms → escrow releases

Document verification is step 1 of that flow.
