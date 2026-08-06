import { VerificationService, VerificationError } from '../../verification/service.js';

const service = new VerificationService();

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
    const result = await service.verifyDocument(body);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, verification: result }));
  } catch (err) {
    const status = err instanceof VerificationError ? err.statusCode : 500;
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
      if (data.length > 10 * 1024 * 1024) {
        reject(new VerificationError('Request body too large (max 10MB)', 413));
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
