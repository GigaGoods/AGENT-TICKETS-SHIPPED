import { VerificationService, VerificationError } from '../../verification/service.js';

let service;

/**
 * POST /api/verify
 *
 * Request body (JSON):
 * {
 *   "documentBase64": "<base64 string>",
 *   "mimeType": "image/png",
 *   "listingId": "optional-listing-id",
 *   "listing": {
 *     "eventName": "Taylor Swift",
 *     "eventDate": "2026-09-15",
 *     "venue": "MetLife Stadium",
 *     "priceUsdc": 250,
 *     "ticketCount": 2
 *   }
 * }
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleVerify(req, res) {
  try {
    const body = await readJsonBody(req);
    service ??= new VerificationService();
    const result = await service.verifyDocument(body);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, verification: result }));
  } catch (err) {
    const missingKey = err instanceof Error && err.message.includes('GOOGLE_API_KEY');
    const status = err instanceof VerificationError ? err.statusCode : missingKey ? 503 : 500;
    const message = err instanceof Error ? err.message : 'Verification failed';

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: message }));
  }
}

/** @param {import('node:http').IncomingMessage} req */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 12 * 1024 * 1024) {
        reject(new VerificationError('Request body too large (max 12MB)', 413));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        reject(new VerificationError('Invalid JSON body', 400));
      }
    });
    req.on('error', reject);
  });
}
