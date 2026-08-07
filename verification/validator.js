import { VERIFICATION_STATUS } from './types.js';
import { getRequiredFields } from './document-types.js';

const REVIEW_THRESHOLD = 0.75;
const REJECT_THRESHOLD = 0.45;
const EVENT_MATCH_THRESHOLD = 0.58;
const VENUE_MATCH_THRESHOLD = 0.5;

const REVIEW_FLAG_PATTERN =
  /blurry|low.?resolution|cropped|obscured|screenshot.?of.?screenshot|mismatched.?font|partial.?document|suspicious|tamper|forg|fake|unreadable/i;

/** Normalize strings for fuzzy comparison. */
function normalize(value) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token overlap that intentionally accepts a headliner within a full lineup title. */
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
  const smallerSet = Math.min(leftTokens.size, rightTokens.size);
  const jaccard = union === 0 ? 0 : overlap / union;
  const containment = smallerSet === 0 ? 0 : overlap / smallerSet;
  return Math.max(jaccard, containment * 0.9);
}

/** Compare dates while tolerating common MM/DD and DD/MM vision output. */
function datesMatch(expected, actual) {
  if (!expected || !actual) return false;
  const expectedDays = dateCandidates(expected);
  const expectedYear = Number(expectedDays[0]?.slice(0, 4)) || undefined;
  const actualDays = dateCandidates(actual, expectedYear);
  return expectedDays.some((day) => actualDays.includes(day));
}

function dateCandidates(value, fallbackYear) {
  const text = String(value).trim();
  const candidates = new Set();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) addDate(candidates, Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3] ?? fallbackYear);
    if (year) {
      addDate(candidates, year, first, second);
      addDate(candidates, year, second, first);
    }
  }

  const monthName = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i
  );
  if (monthName) {
    const month = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    ].indexOf(monthName[1].slice(0, 3).toLowerCase()) + 1;
    const year = Number(monthName[3] ?? fallbackYear);
    if (year) addDate(candidates, year, month, Number(monthName[2]));
  }

  if (candidates.size === 0 && !fallbackYear) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      candidates.add(parsed.toISOString().slice(0, 10));
    }
  }
  return [...candidates];
}

function addDate(target, year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  ) {
    target.add(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }
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
  const flags = [...extractionFlags];

  const eventScore = similarity(listing.eventName, extracted.eventName);
  fieldMatches.push({
    field: 'eventName',
    matched: eventScore >= EVENT_MATCH_THRESHOLD,
    expected: listing.eventName,
    actual: extracted.eventName,
    reason:
      eventScore >= EVENT_MATCH_THRESHOLD
        ? undefined
        : `Event title differs from the document (${Math.round(eventScore * 100)}% match)`,
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
    matched: venueScore >= VENUE_MATCH_THRESHOLD || !extracted.venue,
    expected: listing.venue,
    actual: extracted.venue,
    reason:
      venueScore >= VENUE_MATCH_THRESHOLD || !extracted.venue
        ? undefined
        : 'Venue differs from listing',
  });

  if (listing.ticketCount != null && extracted.ticketCount != null) {
    fieldMatches.push({
      field: 'ticketCount',
      matched: listing.ticketCount === extracted.ticketCount,
      expected: String(listing.ticketCount),
      actual: String(extracted.ticketCount),
      reason:
        listing.ticketCount === extracted.ticketCount
          ? undefined
          : 'Ticket quantity differs from listing',
    });
  }

  const requiredFields = getRequiredFields(documentType);
  const missingRequired = requiredFields.filter((f) => !extracted[f]);
  if (missingRequired.length > 0) {
    flags.push(`missing_required_fields:${missingRequired.join(',')}`);
  }

  const eventMatched = fieldMatches.find((m) => m.field === 'eventName')?.matched;
  const dateMatchedResult = fieldMatches.find((m) => m.field === 'eventDate')?.matched;
  const ticketDetected =
    documentType !== 'unknown' &&
    Boolean(extracted.eventName) &&
    Boolean(extracted.eventDate || extracted.venue || extracted.platform);
  const matchRatio =
    fieldMatches.filter((m) => m.matched).length / Math.max(fieldMatches.length, 1);

  const confidence = Math.min(
    1,
    extractionConfidence * 0.6 + matchRatio * 0.4
  );

  /** @type {import('./types.js').VerificationStatus} */
  let status = VERIFICATION_STATUS.VERIFIED;
  let rejectionReason;
  const reviewReasons = [];
  const reviewFlags = flags.filter((flag) => REVIEW_FLAG_PATTERN.test(flag));
  const nonCriticalMismatch = fieldMatches.find(
    (match) => !match.matched && !['eventName', 'eventDate'].includes(match.field)
  );

  // Loose-ticket policy: the check answers ONE question — is this plausibly a
  // ticket document? If yes it verifies; if it clearly isn't one, it rejects.
  // Soft signals (image quality, tampering heuristics, unreadable optional
  // fields, non-critical mismatches) are reported for transparency but never
  // block a listing — they were producing false "manual review" on ordinary
  // phone screenshots of real tickets.
  if (!ticketDetected) {
    status = VERIFICATION_STATUS.REJECTED;
    rejectionReason = 'The uploaded image was not recognized as a ticket document';
  } else {
    status = VERIFICATION_STATUS.VERIFIED;

    if (confidence < REVIEW_THRESHOLD) {
      reviewReasons.push('Document or listing-match confidence is below 75%');
    }
    if (reviewFlags.length > 0) {
      reviewReasons.push(`Image quality note: ${reviewFlags.join(', ')}`);
    }
    if (missingRequired.length > 0) {
      reviewReasons.push(`Could not read: ${missingRequired.join(', ')}`);
    }
    if (!eventMatched) {
      reviewReasons.push('Event name differs from the listing');
    }
    if (!dateMatchedResult) {
      reviewReasons.push('Event date differs from the listing');
    }
    if (nonCriticalMismatch) {
      reviewReasons.push(nonCriticalMismatch.reason ?? `${nonCriticalMismatch.field} mismatch`);
    }
  }

  return {
    status,
    documentType,
    extracted,
    fieldMatches,
    confidence,
    flags,
    ticketDetected,
    reviewReasons,
    rejectionReason,
  };
}
