import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleVisionProvider } from '../verification/vision/providers/google-vision.js';

test('falls back to Flash when the preferred Gemini model is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const requestedModels = [];

  globalThis.fetch = async (url) => {
    requestedModels.push(String(url).match(/models\/([^:]+)/)?.[1]);
    if (requestedModels.length === 1) {
      return new Response('model unavailable', { status: 404 });
    }
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  documentType: 'mobile_ticket',
                  extracted: {
                    eventName: 'Ranger Trucco',
                    eventDate: '2026-09-12',
                    venue: 'Club Space Miami',
                  },
                  confidence: 0.9,
                  flags: [],
                }),
              },
            ],
          },
        },
      ],
    });
  };

  try {
    const provider = createGoogleVisionProvider({
      apiKey: 'test-key',
      model: 'gemini-pro-latest',
    });
    const result = await provider.extract({
      documentBase64: 'test',
      mimeType: 'image/png',
    });

    assert.equal(result.model, 'gemini-3.6-flash');
    assert.deepEqual(requestedModels, ['gemini-pro-latest', 'gemini-3.6-flash']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
