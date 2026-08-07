import * as listings from '../lib/listings-service.js';
import { sendJson, sendProblem } from './errors.js';
import { checkIdempotency, rememberIdempotency } from './idempotency.js';
import {
  parseListFilters,
  validateListFilters,
  validateListingInput,
} from './validate-listing.js';

/**
 * @typedef {Object} RequestContext
 * @property {'agent' | 'human'} listedBy
 * @property {string} requestId
 */

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {'agent' | 'human'}
 */
export function detectListedBy(req) {
  const header = req.headers['x-listed-by'];
  if (typeof header === 'string' && header.toLowerCase() === 'agent') {
    return 'agent';
  }

  const userAgent = req.headers['user-agent'] ?? '';
  if (/agent|bot|curl|httpie/i.test(userAgent)) {
    return 'agent';
  }

  return 'human';
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 * @param {RequestContext} ctx
 */
export async function handleListings(req, res, body, ctx) {
  if (req.method === 'GET') {
    return handleGet(req, res, ctx);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, body, ctx);
  }

  res.setHeader('Allow', 'GET, POST');
  return sendProblem(res, 'METHOD_NOT_ALLOWED', {
    detail: 'Use GET to read listings or POST to create a listing.',
    retryable: false,
    requestId: ctx.requestId,
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {RequestContext} ctx
 */
function handleGet(req, res, ctx) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const filters = parseListFilters(
    Object.fromEntries(url.searchParams.entries())
  );
  const filterErrors = validateListFilters(filters);

  if (filterErrors.length > 0) {
    return sendProblem(res, 'VALIDATION_FAILED', {
      detail: 'One or more query parameters failed validation.',
      retryable: false,
      errors: filterErrors,
      requestId: ctx.requestId,
    });
  }

  const result = listings.list(filters);
  return sendJson(res, 200, result, { 'X-Request-Id': ctx.requestId });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 * @param {RequestContext} ctx
 */
function handlePost(req, res, body, ctx) {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return sendProblem(res, 'UNSUPPORTED_MEDIA_TYPE', {
      detail: 'Content-Type must be application/json.',
      retryable: false,
      requestId: ctx.requestId,
    });
  }

  const idempotencyKey = req.headers['idempotency-key'];
  if (typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    const cached = checkIdempotency(idempotencyKey.trim(), body);
    if ('conflict' in cached && cached.conflict) {
      return sendProblem(res, 'IDEMPOTENCY_CONFLICT', {
        detail:
          'This Idempotency-Key was already used with a different request body.',
        retryable: false,
        requestId: ctx.requestId,
      });
    }
    if (cached.hit) {
      return sendJson(
        res,
        201,
        { listing: cached.listing },
        { 'X-Request-Id': ctx.requestId }
      );
    }
  }

  const result = validateListingInput(body);
  if (!result.ok) {
    return sendProblem(res, 'VALIDATION_FAILED', {
      detail: 'One or more fields failed validation.',
      retryable: false,
      errors: result.errors,
      requestId: ctx.requestId,
    });
  }

  const listing = listings.create({
    ...result.value,
    listedBy: ctx.listedBy,
  });

  if (typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    rememberIdempotency(idempotencyKey.trim(), body, listing);
  }

  return sendJson(res, 201, { listing }, { 'X-Request-Id': ctx.requestId });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {RequestContext} ctx
 */
export function handleHealth(res, ctx) {
  return sendJson(
    res,
    200,
    { status: 'ok', version: '0.1.0' },
    { 'X-Request-Id': ctx.requestId }
  );
}
