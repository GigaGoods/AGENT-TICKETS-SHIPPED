/**
 * Core types for ticket document verification.
 * Used before on-chain escrow — proves a seller actually owns the ticket.
 */

/** @typedef {'pending' | 'verified' | 'rejected' | 'needs_review'} VerificationStatus */

/** @typedef {'email_confirmation' | 'mobile_ticket' | 'pdf_ticket' | 'order_receipt' | 'unknown'} DocumentType */

/**
 * @typedef {Object} ExtractedTicketFields
 * @property {string | null} eventName
 * @property {string | null} eventDate       ISO date string if parseable
 * @property {string | null} venue
 * @property {string | null} platform        e.g. Ticketmaster, Eventbrite, AXS
 * @property {string | null} orderId
 * @property {string | null} confirmationNumber
 * @property {number | null} ticketCount
 * @property {string | null} seatInfo
 * @property {number | null} pricePaid
 * @property {string | null} currency
 * @property {string | null} barcodeOrQrPresent  'yes' | 'no' | 'unknown'
 */

/**
 * @typedef {Object} ListingContext
 * Fields from the seller's listing that we cross-check against the document.
 * @property {string} eventName
 * @property {string} eventDate
 * @property {string} venue
 * @property {number} [priceUsdc]
 * @property {number} [ticketCount]
 */

/**
 * @typedef {Object} FieldMatch
 * @property {string} field
 * @property {boolean} matched
 * @property {string} [expected]
 * @property {string | null} [actual]
 * @property {string} [reason]
 */

/**
 * @typedef {Object} VerificationResult
 * @property {string} id
 * @property {VerificationStatus} status
 * @property {DocumentType} documentType
 * @property {ExtractedTicketFields} extracted
 * @property {FieldMatch[]} fieldMatches
 * @property {number} confidence          0–1 overall score
 * @property {string[]} flags             Human-review triggers
 * @property {boolean} ticketDetected
 * @property {string[]} reviewReasons
 * @property {string} [rejectionReason]
 * @property {string} verifiedAt            ISO timestamp
 * @property {string} provider              Vision provider used
 * @property {string} [model]               Model that handled the request
 */

/**
 * @typedef {Object} VerifyDocumentInput
 * @property {string} documentBase64        Base64-encoded image or PDF
 * @property {'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'} mimeType
 * @property {ListingContext} listing
 * @property {string} [listingId]
 */

export const VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  NEEDS_REVIEW: 'needs_review',
};

export const DOCUMENT_TYPES = {
  EMAIL_CONFIRMATION: 'email_confirmation',
  MOBILE_TICKET: 'mobile_ticket',
  PDF_TICKET: 'pdf_ticket',
  ORDER_RECEIPT: 'order_receipt',
  UNKNOWN: 'unknown',
};
