/**
 * Vision provider interface.
 * Swap implementations without changing the verification service.
 *
 * @typedef {Object} VisionExtractionResult
 * @property {import('../types.js').DocumentType} documentType
 * @property {import('../types.js').ExtractedTicketFields} extracted
 * @property {number} confidence
 * @property {string[]} flags
 * @property {string} rawResponse   Provider response for audit/debug
 */

/**
 * @typedef {Object} VisionProvider
 * @property {string} name
 * @property {(input: { documentBase64: string, mimeType: string }) => Promise<VisionExtractionResult>} extract
 */

import { createOpenAIVisionProvider } from './providers/openai-vision.js';
import { createGoogleVisionProvider } from './providers/google-vision.js';

/**
 * @param {{ provider: string, openaiApiKey?: string, openaiModel?: string, googleApiKey?: string, googleModel?: string }} config
 * @returns {VisionProvider}
 */
export function createVisionProvider(config) {
  switch (config.provider) {
    case 'openai':
      return createOpenAIVisionProvider({
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
      });
    case 'google':
      return createGoogleVisionProvider({
        apiKey: config.googleApiKey,
        model: config.googleModel,
      });
    default:
      throw new Error(
        `Unknown vision provider "${config.provider}". Use "openai" or "google".`
      );
  }
}
