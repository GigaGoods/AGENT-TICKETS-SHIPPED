/**
 * Prompts sent to the vision API to extract structured ticket data from documents.
 * Keep the response format strict so parsing stays reliable.
 */

export const EXTRACTION_SYSTEM_PROMPT = `You are a document verification assistant for a peer-to-peer ticket marketplace.
Your job is to extract structured data from proof-of-purchase documents (email confirmations, mobile tickets, PDFs, receipts).
Only extract what is clearly visible. Use null for fields you cannot read with confidence.
Do not invent or guess values. Flag suspicious edits, mismatched fonts, or obvious tampering in the "flags" array.`;

export const EXTRACTION_USER_PROMPT = `Analyze this ticket proof document and return ONLY valid JSON with this exact shape:
{
  "documentType": "email_confirmation" | "mobile_ticket" | "pdf_ticket" | "order_receipt" | "unknown",
  "extracted": {
    "eventName": string | null,
    "eventDate": string | null,
    "venue": string | null,
    "platform": string | null,
    "orderId": string | null,
    "confirmationNumber": string | null,
    "ticketCount": number | null,
    "seatInfo": string | null,
    "pricePaid": number | null,
    "currency": string | null,
    "barcodeOrQrPresent": "yes" | "no" | "unknown"
  },
  "confidence": number,
  "flags": string[]
}

Rules:
- eventDate should be ISO 8601 (YYYY-MM-DD) only when the year is visibly printed
- if only month and day are visible, return MM-DD (for example 08-08); never infer or invent a year
- eventName should contain the complete displayed event or lineup title, not only one artist
- platform examples: Ticketmaster, Eventbrite, AXS, SeatGeek, StubHub, Dice, See Tickets
- confidence is 0.0–1.0 based on image clarity and field certainty
- a normal direct screenshot of a ticket app is valid and must NOT be flagged merely for being a screenshot
- only add flags for concrete concerns; do not flag missing optional fields
- flags examples: "blurry_image", "cropped_document", "possible_screenshot_of_screenshot", "suspicious_editing"`;
