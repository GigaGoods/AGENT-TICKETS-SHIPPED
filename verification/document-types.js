import { DOCUMENT_TYPES } from './types.js';

/**
 * Supported proof-of-purchase document types for P2P digital ticket resale.
 * Each type lists the minimum fields the vision layer should try to extract.
 */
export const SUPPORTED_DOCUMENT_TYPES = {
  [DOCUMENT_TYPES.EMAIL_CONFIRMATION]: {
    label: 'Email confirmation screenshot',
    description: 'Screenshot of purchase confirmation email from Ticketmaster, Eventbrite, AXS, etc.',
    requiredFields: ['eventName', 'eventDate', 'orderId'],
    optionalFields: ['venue', 'platform', 'confirmationNumber', 'ticketCount', 'pricePaid'],
    acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  [DOCUMENT_TYPES.MOBILE_TICKET]: {
    label: 'Mobile wallet ticket',
    description: 'Screenshot of ticket in Apple Wallet, Google Wallet, or venue app.',
    requiredFields: ['eventName', 'eventDate'],
    optionalFields: ['venue', 'seatInfo', 'barcodeOrQrPresent', 'platform'],
    acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  [DOCUMENT_TYPES.PDF_TICKET]: {
    label: 'PDF ticket or receipt',
    description: 'Downloaded PDF ticket or order receipt from the primary seller.',
    requiredFields: ['eventName', 'eventDate'],
    optionalFields: ['venue', 'orderId', 'confirmationNumber', 'seatInfo', 'platform'],
    acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  [DOCUMENT_TYPES.ORDER_RECEIPT]: {
    label: 'Order / checkout receipt',
    description: 'Screenshot of order history or checkout confirmation page.',
    requiredFields: ['eventName', 'orderId'],
    optionalFields: ['eventDate', 'venue', 'platform', 'pricePaid', 'ticketCount'],
    acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
};

/** @param {string} mimeType */
export function isSupportedMimeType(mimeType) {
  return Object.values(SUPPORTED_DOCUMENT_TYPES).some((doc) =>
    doc.acceptedMimeTypes.includes(mimeType)
  );
}

/** @param {import('./types.js').DocumentType} type */
export function getRequiredFields(type) {
  return SUPPORTED_DOCUMENT_TYPES[type]?.requiredFields ?? [];
}
