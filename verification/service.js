import { randomUUID } from 'node:crypto';
import { createVisionProvider } from './vision/provider.js';
import { validateExtractedDocument } from './validator.js';
import { isSupportedMimeType } from './document-types.js';
import { loadConfig } from '../config.js';
import { getVerificationCaveats } from './caveats.js';

/**
 * Main verification orchestrator.
 * 1. Accept uploaded proof document
 * 2. Send to vision API for structured extraction
 * 3. Cross-check extracted fields against the listing
 * 4. Return verification result (verified / rejected / needs_review)
 */
export class VerificationService {
  /** @param {ReturnType<typeof loadConfig>} [config] */
  constructor(config = loadConfig()) {
    this.config = config;
    this.vision = createVisionProvider(config.vision);
  }

  /**
   * @param {import('./types.js').VerifyDocumentInput} input
   * @returns {Promise<import('./types.js').VerificationResult>}
   */
  async verifyDocument(input) {
    const { documentBase64, mimeType, listing, listingId } = input;

    if (!documentBase64) {
      throw new VerificationError('documentBase64 is required', 400);
    }
    if (!isSupportedMimeType(mimeType)) {
      throw new VerificationError(
        `Unsupported mime type "${mimeType}". Use PNG, JPEG, WebP, or PDF.`,
        400
      );
    }
    if (!listing?.eventName || !listing?.eventDate || !listing?.venue) {
      throw new VerificationError(
        'listing must include eventName, eventDate, and venue',
        400
      );
    }

    const extraction = await this.vision.extract({ documentBase64, mimeType });

    const result = validateExtractedDocument(
      extraction.extracted,
      listing,
      extraction.documentType,
      extraction.confidence,
      extraction.flags
    );

    const caveatInfo = getVerificationCaveats(result.flags);

    return {
      id: randomUUID(),
      ...result,
      verifiedAt: new Date().toISOString(),
      provider: this.vision.name,
      model: extraction.model,
      listingId,
      disclaimer: caveatInfo.disclaimer,
      activeWarnings: caveatInfo.activeWarnings,
      caveats: caveatInfo.caveats,
    };
  }
}

export class VerificationError extends Error {
  /** @param {string} message @param {number} [statusCode] */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'VerificationError';
    this.statusCode = statusCode;
  }
}
