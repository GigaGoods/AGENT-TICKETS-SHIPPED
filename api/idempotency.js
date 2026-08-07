import { createHash } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { bodyHash: string, listing: import('../lib/listings-service.js').Listing, expiresAt: number }>} */
const cache = new Map();

/**
 * @param {unknown} body
 * @returns {string}
 */
function hashBody(body) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

/**
 * @param {string} key
 * @param {unknown} body
 * @returns {{ hit: false } | { hit: true, listing: import('../lib/listings-service.js').Listing } | { conflict: true }}
 */
export function checkIdempotency(key, body) {
  purgeExpired();

  const entry = cache.get(key);
  if (!entry) {
    return { hit: false };
  }

  const bodyHash = hashBody(body);
  if (entry.bodyHash !== bodyHash) {
    return { conflict: true };
  }

  return { hit: true, listing: entry.listing };
}

/**
 * @param {string} key
 * @param {unknown} body
 * @param {import('../lib/listings-service.js').Listing} listing
 */
export function rememberIdempotency(key, body, listing) {
  cache.set(key, {
    bodyHash: hashBody(body),
    listing,
    expiresAt: Date.now() + TTL_MS,
  });
}
