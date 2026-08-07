import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from '../../prompts.js';
import { DOCUMENT_TYPES } from '../../types.js';

const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Google Gemini Vision provider (default).
 * Requires GOOGLE_API_KEY from https://aistudio.google.com/apikey
 *
 * Note: Google Cloud Vision OCR alone returns raw text — you still need an LLM
 * step to structure ticket fields. This provider uses Gemini for both.
 *
 * @param {{ apiKey?: string, model?: string }} options
 */
export function createGoogleVisionProvider({
  apiKey,
  model = 'gemini-flash-latest',
} = {}) {
  if (!apiKey) {
    throw new Error(
      'GOOGLE_API_KEY is required. Get one at https://aistudio.google.com/apikey'
    );
  }

  return {
    name: 'google',

    /** @param {{ documentBase64: string, mimeType: string }} input */
    async extract({ documentBase64, mimeType }) {
      const requestBody = JSON.stringify({
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [
          {
            parts: [
              { text: EXTRACTION_USER_PROMPT },
              { inlineData: { mimeType, data: documentBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const models = [...new Set([model, ...FALLBACK_MODELS])];
      let lastError;

      for (const candidateModel of models) {
        const attempts = candidateModel === model ? 2 : 1;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: requestBody,
            }
          );

          if (response.ok) {
            const data = await response.json();
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
            const parsed = JSON.parse(raw);

            return {
              documentType: parsed.documentType ?? DOCUMENT_TYPES.UNKNOWN,
              extracted: normalizeExtracted(parsed.extracted ?? {}),
              confidence: clamp(parsed.confidence ?? 0.5),
              flags: Array.isArray(parsed.flags) ? parsed.flags : [],
              rawResponse: raw,
              model: candidateModel,
            };
          }

          const details = await response.text();
          lastError = new Error(
            `Google Gemini API error (${response.status}) on ${candidateModel}: ${details}`
          );

          if (RETRYABLE_STATUSES.has(response.status) && attempt + 1 < attempts) {
            await delay(800 * (attempt + 1));
            continue;
          }

          if (!RETRYABLE_STATUSES.has(response.status) && response.status !== 404) {
            throw lastError;
          }
          break;
        }
      }

      throw lastError ?? new Error('All configured Gemini models were unavailable');
    },
  };
}

/** @param {Record<string, unknown>} raw */
function normalizeExtracted(raw) {
  return {
    eventName: strOrNull(raw.eventName),
    eventDate: strOrNull(raw.eventDate),
    venue: strOrNull(raw.venue),
    platform: strOrNull(raw.platform),
    orderId: strOrNull(raw.orderId),
    confirmationNumber: strOrNull(raw.confirmationNumber),
    ticketCount: numOrNull(raw.ticketCount),
    seatInfo: strOrNull(raw.seatInfo),
    pricePaid: numOrNull(raw.pricePaid),
    currency: strOrNull(raw.currency),
    barcodeOrQrPresent: strOrNull(raw.barcodeOrQrPresent) ?? 'unknown',
  };
}

/** @param {unknown} v */
function strOrNull(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** @param {unknown} v */
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {number} n */
function clamp(n) {
  return Math.max(0, Math.min(1, n));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
