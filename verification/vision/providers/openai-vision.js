import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from '../../prompts.js';
import { DOCUMENT_TYPES } from '../../types.js';

const DEFAULT_MODEL = 'gpt-4o';

/**
 * OpenAI Vision provider — best starting point for ticket screenshots and emails.
 * Requires OPENAI_API_KEY in your environment.
 *
 * @param {{ apiKey?: string, model?: string }} options
 */
export function createOpenAIVisionProvider({ apiKey, model = DEFAULT_MODEL } = {}) {
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required. Get one at https://platform.openai.com/api-keys'
    );
  }

  return {
    name: 'openai',

    /** @param {{ documentBase64: string, mimeType: string }} input */
    async extract({ documentBase64, mimeType }) {
      const dataUrl = `data:${mimeType};base64,${documentBase64}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: EXTRACTION_USER_PROMPT },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              ],
            },
          ],
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI Vision API error (${response.status}): ${err}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? '{}';
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
