import { randomUUID } from 'node:crypto';

export const PROBLEM_BASE = 'https://agent-tickets.dev/errors';

/** @type {Record<string, { type: string, title: string, status: number }>} */
export const ERROR_DEFS = {
  VALIDATION_FAILED: {
    type: `${PROBLEM_BASE}/validation`,
    title: 'Validation Failed',
    status: 400,
  },
  INVALID_JSON: {
    type: `${PROBLEM_BASE}/invalid-json`,
    title: 'Invalid JSON',
    status: 400,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    type: `${PROBLEM_BASE}/unsupported-media-type`,
    title: 'Unsupported Media Type',
    status: 415,
  },
  METHOD_NOT_ALLOWED: {
    type: `${PROBLEM_BASE}/method-not-allowed`,
    title: 'Method Not Allowed',
    status: 405,
  },
  NOT_FOUND: {
    type: `${PROBLEM_BASE}/not-found`,
    title: 'Not Found',
    status: 404,
  },
  IDEMPOTENCY_CONFLICT: {
    type: `${PROBLEM_BASE}/idempotency-conflict`,
    title: 'Idempotency Conflict',
    status: 409,
  },
  RATE_LIMITED: {
    type: `${PROBLEM_BASE}/rate-limited`,
    title: 'Rate Limit Exceeded',
    status: 429,
  },
  INTERNAL_ERROR: {
    type: `${PROBLEM_BASE}/internal`,
    title: 'Internal Server Error',
    status: 500,
  },
};

/**
 * @typedef {Object} FieldError
 * @property {string} field
 * @property {string} code
 * @property {string} message
 * @property {unknown} [received]
 * @property {string} [expected]
 */

/**
 * @param {import('node:http').ServerResponse} res
 * @param {keyof typeof ERROR_DEFS} errorCode
 * @param {Object} [options]
 * @param {string} [options.detail]
 * @param {boolean} [options.retryable]
 * @param {FieldError[]} [options.errors]
 * @param {string} [options.requestId]
 * @param {Record<string, string>} [options.headers]
 */
export function sendProblem(res, errorCode, options = {}) {
  const def = ERROR_DEFS[errorCode] ?? ERROR_DEFS.INTERNAL_ERROR;
  const requestId = options.requestId ?? randomUUID();

  /** @type {Record<string, unknown>} */
  const body = {
    type: def.type,
    title: def.title,
    status: def.status,
    detail: options.detail ?? def.title,
    errorCode,
    retryable: options.retryable ?? def.status >= 500,
    requestId,
  };

  if (options.errors?.length) {
    body.errors = options.errors;
  }

  const headers = {
    'Content-Type': 'application/problem+json',
    'X-Request-Id': requestId,
    ...options.headers,
  };

  res.writeHead(def.status, headers);
  res.end(JSON.stringify(body));
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 * @param {Record<string, string>} [extraHeaders]
 */
export function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}
