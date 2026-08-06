import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from '../../prompts.js';
import { DOCUMENT_TYPES } from '../../types.js';

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
  model = 'gemini-2.0-flash',
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google Gemini API error (${response.status}): ${err}`);
      }

      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const parsed = JSON.parse(raw);

      return {
        documentType: parsed.documentType ?? DOCUMENT_TYPES.UNKNOWN,
        extracted: normalizeExtracted(parsed.extracted ?? {}),
        confidence: clamp(parsed.confidence ?? 0.5),
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        rawResponse: raw,
      };
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
