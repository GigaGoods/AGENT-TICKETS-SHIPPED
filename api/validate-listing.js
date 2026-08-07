/**
 * @typedef {Object} FieldError
 * @property {string} field
 * @property {string} code
 * @property {string} message
 * @property {unknown} [received]
 * @property {string} [expected]
 */

/**
 * @typedef {Object} ValidatedListing
 * @property {string} eventName
 * @property {string} eventDate
 * @property {string} venue
 * @property {number} priceUsdc
 * @property {number} ticketCount
 */

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasAtMostTwoDecimals(value) {
  const str = String(value);
  const dotIndex = str.indexOf('.');
  if (dotIndex === -1) return true;
  return str.length - dotIndex - 1 <= 2;
}

/**
 * @param {unknown} input
 * @returns {{ ok: true, value: ValidatedListing } | { ok: false, errors: FieldError[] }}
 */
export function validateListingInput(input) {
  /** @type {FieldError[]} */
  const errors = [];

  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [
        {
          field: 'body',
          code: 'INVALID_TYPE',
          message: 'Request body must be a JSON object',
          received: input,
          expected: '{ eventName, eventDate, venue, priceUsdc, ticketCount? }',
        },
      ],
    };
  }

  const body = /** @type {Record<string, unknown>} */ (input);

  if (typeof body.eventName !== 'string' || !body.eventName.trim()) {
    errors.push({
      field: 'eventName',
      code: body.eventName == null ? 'REQUIRED' : 'INVALID_TYPE',
      message: 'eventName is required and must be a non-empty string',
      received: body.eventName,
      expected: 'string, 1–200 characters',
    });
  } else if (body.eventName.trim().length > 200) {
    errors.push({
      field: 'eventName',
      code: 'TOO_LONG',
      message: 'eventName must be at most 200 characters',
      received: body.eventName.length,
      expected: 'string, 1–200 characters',
    });
  }

  if (typeof body.eventDate !== 'string' || !body.eventDate.trim()) {
    errors.push({
      field: 'eventDate',
      code: body.eventDate == null ? 'REQUIRED' : 'INVALID_TYPE',
      message: 'eventDate is required and must be an ISO 8601 date or datetime',
      received: body.eventDate,
      expected: 'ISO 8601, e.g. 2026-08-15 or 2026-08-15T20:00:00Z',
    });
  } else if (!isValidIsoDate(body.eventDate.trim())) {
    errors.push({
      field: 'eventDate',
      code: 'INVALID_FORMAT',
      message: 'eventDate must be a valid ISO 8601 date or datetime',
      received: body.eventDate,
      expected: 'ISO 8601, e.g. 2026-08-15 or 2026-08-15T20:00:00Z',
    });
  }

  if (typeof body.venue !== 'string' || !body.venue.trim()) {
    errors.push({
      field: 'venue',
      code: body.venue == null ? 'REQUIRED' : 'INVALID_TYPE',
      message: 'venue is required and must be a non-empty string',
      received: body.venue,
      expected: 'string, 1–200 characters',
    });
  } else if (body.venue.trim().length > 200) {
    errors.push({
      field: 'venue',
      code: 'TOO_LONG',
      message: 'venue must be at most 200 characters',
      received: body.venue.length,
      expected: 'string, 1–200 characters',
    });
  }

  if (body.priceUsdc == null) {
    errors.push({
      field: 'priceUsdc',
      code: 'REQUIRED',
      message: 'priceUsdc is required',
      received: body.priceUsdc,
      expected: 'number > 0 with at most 2 decimal places',
    });
  } else if (typeof body.priceUsdc !== 'number' || Number.isNaN(body.priceUsdc)) {
    errors.push({
      field: 'priceUsdc',
      code: 'INVALID_TYPE',
      message: 'priceUsdc must be a number',
      received: body.priceUsdc,
      expected: 'number > 0 with at most 2 decimal places',
    });
  } else if (body.priceUsdc <= 0) {
    errors.push({
      field: 'priceUsdc',
      code: 'INVALID_RANGE',
      message: 'priceUsdc must be greater than 0',
      received: body.priceUsdc,
      expected: 'number > 0',
    });
  } else if (!hasAtMostTwoDecimals(body.priceUsdc)) {
    errors.push({
      field: 'priceUsdc',
      code: 'INVALID_PRECISION',
      message: 'priceUsdc must have at most 2 decimal places',
      received: body.priceUsdc,
      expected: 'number with at most 2 decimal places',
    });
  }

  let ticketCount = 1;
  if (body.ticketCount != null) {
    if (
      typeof body.ticketCount !== 'number' ||
      !Number.isInteger(body.ticketCount)
    ) {
      errors.push({
        field: 'ticketCount',
        code: 'INVALID_TYPE',
        message: 'ticketCount must be an integer',
        received: body.ticketCount,
        expected: 'integer >= 1',
      });
    } else if (body.ticketCount < 1) {
      errors.push({
        field: 'ticketCount',
        code: 'INVALID_RANGE',
        message: 'ticketCount must be at least 1',
        received: body.ticketCount,
        expected: 'integer >= 1',
      });
    } else {
      ticketCount = body.ticketCount;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      eventName: body.eventName.trim(),
      eventDate: body.eventDate.trim(),
      venue: body.venue.trim(),
      priceUsdc: Math.round(body.priceUsdc * 100) / 100,
      ticketCount,
    },
  };
}

/**
 * @param {Record<string, string | string[] | undefined>} query
 */
export function parseListFilters(query) {
  /** @type {import('../lib/listings-service.js').ListFilters} */
  const filters = {};

  if (query.eventName) {
    filters.eventName = String(query.eventName);
  }
  if (query.venue) {
    filters.venue = String(query.venue);
  }
  if (query.maxPriceUsdc != null) {
    filters.maxPriceUsdc = Number(query.maxPriceUsdc);
  }
  if (query.limit != null) {
    filters.limit = Number(query.limit);
  }
  if (query.cursor) {
    filters.cursor = String(query.cursor);
  }

  return filters;
}

/**
 * @param {import('../lib/listings-service.js').ListFilters} filters
 * @returns {FieldError[]}
 */
export function validateListFilters(filters) {
  /** @type {FieldError[]} */
  const errors = [];

  if (
    filters.maxPriceUsdc != null &&
    (Number.isNaN(filters.maxPriceUsdc) || filters.maxPriceUsdc < 0)
  ) {
    errors.push({
      field: 'maxPriceUsdc',
      code: 'INVALID_RANGE',
      message: 'maxPriceUsdc must be a non-negative number',
      received: filters.maxPriceUsdc,
      expected: 'number >= 0',
    });
  }

  if (
    filters.limit != null &&
    (Number.isNaN(filters.limit) || filters.limit < 1)
  ) {
    errors.push({
      field: 'limit',
      code: 'INVALID_RANGE',
      message: 'limit must be a positive integer',
      received: filters.limit,
      expected: 'integer between 1 and 100',
    });
  }

  return errors;
}
