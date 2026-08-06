/**
 * Caveats and limitations for off-chain ticket document verification.
 * Returned with every verification result so callers and UI surfaces know the boundaries.
 */

/** @typedef {{ id: string, category: string, severity: 'info' | 'warning' | 'critical', message: string }} Caveat */

/** @type {Caveat[]} */
export const VERIFICATION_CAVEATS = [
  {
    id: 'proof_of_purchase_only',
    category: 'scope',
    severity: 'critical',
    message:
      'Verification confirms proof-of-purchase only. It does NOT prove the seller still holds the ticket or has not sold it elsewhere.',
  },
  {
    id: 'not_proof_of_transfer',
    category: 'scope',
    severity: 'critical',
    message:
      'A valid receipt does not guarantee the seller can or will transfer the ticket to the buyer. On-chain escrow and transfer confirmation are required for settlement.',
  },
  {
    id: 'ai_extraction_not_infallible',
    category: 'accuracy',
    severity: 'warning',
    message:
      'Gemini Vision extraction can misread blurry, cropped, or low-resolution images. Always treat needs_review results as requiring human review.',
  },
  {
    id: 'forged_documents',
    category: 'fraud',
    severity: 'critical',
    message:
      'Screenshots and PDFs can be edited or fabricated. This system detects obvious tampering flags but cannot cryptographically prove document authenticity.',
  },
  {
    id: 'screenshot_of_screenshot',
    category: 'fraud',
    severity: 'warning',
    message:
      'Photos or screenshots of another screen (Moire patterns, bezels) are a common fraud vector and may be flagged for manual review.',
  },
  {
    id: 'duplicate_listings',
    category: 'fraud',
    severity: 'critical',
    message:
      'The same order confirmation could be used to list the same ticket multiple times. Duplicate order IDs must be checked before publishing a listing.',
  },
  {
    id: 'platform_tos',
    category: 'legal',
    severity: 'warning',
    message:
      'Reselling tickets may violate the original platform Terms of Service (Ticketmaster, Eventbrite, etc.). Agent-Tickets does not guarantee legal resale in every jurisdiction.',
  },
  {
    id: 'no_kyc',
    category: 'compliance',
    severity: 'warning',
    message:
      'Document verification is not KYC. We do not verify seller identity, age, or regulatory compliance. High-value or regulated events may require additional checks.',
  },
  {
    id: 'pii_handling',
    category: 'privacy',
    severity: 'warning',
    message:
      'Ticket documents often contain PII (name, email, partial payment info). Do not persist raw images longer than needed. Redact before logging or storing audit trails.',
  },
  {
    id: 'api_key_server_side',
    category: 'security',
    severity: 'critical',
    message:
      'GOOGLE_API_KEY must stay server-side only. Never expose it in frontend code, mobile apps, or agent client bundles.',
  },
  {
    id: 'gemini_rate_limits',
    category: 'operational',
    severity: 'info',
    message:
      'Gemini free tier has rate limits and quotas. Production workloads should use billing-enabled Google AI Studio or Vertex AI with monitoring.',
  },
  {
    id: 'pdf_limitations',
    category: 'accuracy',
    severity: 'info',
    message:
      'Multi-page PDFs, password-protected files, and scanned low-DPI documents may fail extraction or return incomplete fields.',
  },
  {
    id: 'event_name_fuzzy_match',
    category: 'accuracy',
    severity: 'info',
    message:
      'Event names are fuzzy-matched (e.g. "Taylor Swift | The Eras Tour" vs "Taylor Swift"). Minor mismatches may pass; major mismatches reject the listing.',
  },
  {
    id: 'barcode_not_validated',
    category: 'scope',
    severity: 'warning',
    message:
      'QR codes and barcodes visible in images are not scanned or validated against venue systems. Barcode presence alone is not proof the ticket is valid at the door.',
  },
  {
    id: 'blockchain_not_connected',
    category: 'scope',
    severity: 'info',
    message:
      'This module runs off-chain. Verification status does not write to Solana or hold USDC escrow. Blockchain settlement is a separate step.',
  },
  {
    id: 'human_review_required',
    category: 'operational',
    severity: 'warning',
    message:
      'Listings with status needs_review must not go live until a human approves. Auto-publishing verified results without review is not recommended for V1.',
  },
];

/** Short disclaimer string for API responses and UI footers. */
export const VERIFICATION_DISCLAIMER =
  'Document verification is proof-of-purchase assistance only. It does not guarantee ticket validity at the venue, prevent double-selling, or replace on-chain escrow.';

/**
 * @param {string[]} [activeFlags] Extraction/validation flags from this run
 * @returns {{ caveats: Caveat[], disclaimer: string, activeWarnings: string[] }}
 */
export function getVerificationCaveats(activeFlags = []) {
  const activeWarnings = [];

  if (activeFlags.some((f) => f.includes('suspicious') || f.includes('tamper'))) {
    activeWarnings.push('Document flagged for possible tampering — human review required.');
  }
  if (activeFlags.some((f) => f.includes('blurry') || f.includes('screenshot'))) {
    activeWarnings.push('Image quality or screenshot-of-screenshot detected — confidence may be low.');
  }
  if (activeFlags.some((f) => f.includes('missing_required'))) {
    activeWarnings.push('Required fields could not be extracted — verification incomplete.');
  }

  return {
    caveats: VERIFICATION_CAVEATS,
    disclaimer: VERIFICATION_DISCLAIMER,
    activeWarnings,
  };
}
