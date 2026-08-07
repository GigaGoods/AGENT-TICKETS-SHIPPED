/**
 * Example: verify a ticket document from the command line.
 *
 * Usage:
 *   export GOOGLE_API_KEY=your-key
 *   node examples/verify-document.js path/to/ticket-screenshot.png
 *
 * Requires Node 18+ (native fetch).
 */

import { readFileSync } from 'node:fs';
import { VerificationService } from '../verification/service.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node examples/verify-document.js <image-or-pdf-path>');
  process.exit(1);
}

const buffer = readFileSync(filePath);
const documentBase64 = buffer.toString('base64');
const mimeType = filePath.endsWith('.pdf')
  ? 'application/pdf'
  : filePath.endsWith('.webp')
    ? 'image/webp'
    : 'image/png';

const listing = {
  eventName: process.env.EVENT_NAME ?? 'Taylor Swift',
  eventDate: process.env.EVENT_DATE ?? '2026-09-15',
  venue: process.env.VENUE ?? 'MetLife Stadium',
  ticketCount: 2,
};

const service = new VerificationService();

console.log('Verifying document...\n');

try {
  const result = await service.verifyDocument({
    documentBase64,
    mimeType,
    listing,
  });

  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Verification failed:', err.message);
  process.exit(1);
}
