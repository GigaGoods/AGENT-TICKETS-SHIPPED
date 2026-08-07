import { VerificationService, VerificationError } from '../../verification/service.js';

let service;

export default async (req) => {
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  try {
    const body = await req.json();
    service ??= new VerificationService();
    const verification = await service.verifyDocument(body);
    return json(200, { ok: true, verification });
  } catch (err) {
    const missingKey = err instanceof Error && err.message.includes('GOOGLE_API_KEY');
    const status = err instanceof VerificationError ? err.statusCode : missingKey ? 503 : 500;
    return json(status, { ok: false, error: err?.message ?? 'Verification failed' });
  }
};

export const config = { path: '/api/verify' };
