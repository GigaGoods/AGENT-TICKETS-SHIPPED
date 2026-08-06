import { VERIFICATION_STATUS } from './types.js';
import { getRequiredFields } from './document-types.js';

const REVIEW_THRESHOLD = 0.75;
const REJECT_THRESHOLD = 0.45;

/** Normalize strings for fuzzy comparison. */
function normalize(value) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple token overlap score between two strings. */
function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  const overlap = [...leftTokens].filter((t) => rightTokens.has(t)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : overlap / union;
}

/** Compare ISO-ish date strings by calendar day. */
function datesMatch(expected, actual) {
  if (!expected || !actual) return false;
  const expDay = new Date(expected).toISOString().slice(0, 10);
  const actDay = new Date(actual).toISOString().slice(0, 10);
  return expDay === actDay;
}

/**
 * Cross-check extracted document fields against the seller's listing.
 * @param {import('./types.js').ExtractedTicketFields} extracted
 * @param {import('./types.js').ListingContext} listing
 * @param {import('./types.js').DocumentType} documentType
 * @param {number} extractionConfidence
 * @param {string[]} extractionFlags
 * @returns {Omit<import('./types.js').VerificationResult, 'id' | 'verifiedAt' | 'provider'>}
 */
export function validateExtractedDocument(
  extracted,
  listing,
  documentType,
  extractionConfidence,
  extractionFlags = []
) {
  /** @type {import('./types.js').FieldMatch[]} */
  const fieldMatches = [];

  const eventScore = similarity(listing.eventName, extracted.eventName);
  fieldMatches.push({
    field: 'eventName',
    matched: eventScore >= 0.6,
    expected: listing.eventName,
    actual: extracted.eventName,
    reason: eventScore >= 0.6 ? undefined : `Low similarity (${eventScore.toFixed(2)})`,
  });

  const dateMatched = datesMatch(listing.eventDate, extracted.eventDate);
  fieldMatches.push({
    field: 'eventDate',
    matched: dateMatched,
    expected: listing.eventDate,
    actual: extracted.eventDate,
    reason: dateMatched ? undefined : 'Event date does not match listing',
  });

  const venueScore = similarity(listing.venue, extracted.venue);
  fieldMatches.push({
    field: 'venue',
    matched: venueScore >= 0.5 || !extracted.venue,
    expected: listing.venue,
    actual: extracted.venue,
    reason: venueScore >= 0.5 || !extracted.venue ? undefined : 'Venue mismatch',
  });

  if (listing.ticketCount != null && extracted.ticketCount != null) {
    fieldMatches.push({
      field: 'ticketCount',
      matched: listing.ticketCount === extracted.ticketCount,
      expected: String(listing.ticketCount),
      actual: String(extracted.ticketCount),
    });
  }

  const requiredFields = getRequiredFields(documentType);
  const missingRequired = requiredFields.filter((f) => !extracted[f]);
  if (missingRequired.length > 0) {
    extractionFlags.push(`missing_required_fields:${missingRequired.join(',')}`);
  }

  const criticalMatches = fieldMatches.filter((m) =>
    ['eventName', 'eventDate'].includes(m.field)
  );
  const allCriticalMatched = criticalMatches.every((m) => m.matched);
  const matchRatio =
    fieldMatches.filter((m) => m.matched).length / Math.max(fieldMatches.length, 1);

  const confidence = Math.min(
    1,
    extractionConfidence * 0.6 + matchRatio * 0.4
  );

  /** @type {import('./types.js').VerificationStatus} */
  let status = VERIFICATION_STATUS.VERIFIED;
  let rejectionReason;

  if (!allCriticalMatched || confidence < REJECT_THRESHOLD) {
    status = VERIFICATION_STATUS.REJECTED;
    rejectionReason = !allCriticalMatched
      ? 'Document does not match listing event name or date'
      : 'Confidence too low to verify document';
  } else if (
    confidence < REVIEW_THRESHOLD ||
    extractionFlags.length > 0 ||
    missingRequired.length > 0
  ) {
    status = VERIFICATION_STATUS.NEEDS_REVIEW;
  }

  return {
    status,
    documentType,
    extracted,
    fieldMatches,
    confidence,
    flags: extractionFlags,
    rejectionReason,
  };
}
