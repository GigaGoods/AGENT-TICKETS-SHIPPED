import { randomUUID } from 'node:crypto';
import * as store from './listings-store.js';

/**
 * @typedef {Object} Listing
 * @property {string} id
 * @property {string} eventName
 * @property {string} eventDate
 * @property {string} venue
 * @property {number} priceUsdc
 * @property {number} ticketCount
 * @property {'active'} status
 * @property {'agent' | 'human'} listedBy
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ListingInput
 * @property {string} eventName
 * @property {string} eventDate
 * @property {string} venue
 * @property {number} priceUsdc
 * @property {number} ticketCount
 * @property {'agent' | 'human'} listedBy
 */

/**
 * @typedef {Object} ListFilters
 * @property {string} [eventName]
 * @property {string} [venue]
 * @property {number} [maxPriceUsdc]
 * @property {number} [limit]
 * @property {string} [cursor]
 */

/**
 * @param {ListingInput} input
 * @returns {Listing}
 */
export function create(input) {
  /** @type {Listing} */
  const listing = {
    id: randomUUID(),
    eventName: input.eventName,
    eventDate: input.eventDate,
    venue: input.venue,
    priceUsdc: input.priceUsdc,
    ticketCount: input.ticketCount,
    status: 'active',
    listedBy: input.listedBy,
    createdAt: new Date().toISOString(),
  };

  return store.insert(listing);
}

/**
 * @param {ListFilters} filters
 */
export function list(filters = {}) {
  let results = store.all();

  if (filters.eventName) {
    const query = filters.eventName.toLowerCase();
    results = results.filter((listing) =>
      listing.eventName.toLowerCase().includes(query)
    );
  }

  if (filters.venue) {
    const query = filters.venue.toLowerCase();
    results = results.filter((listing) =>
      listing.venue.toLowerCase().includes(query)
    );
  }

  if (filters.maxPriceUsdc != null && !Number.isNaN(filters.maxPriceUsdc)) {
    results = results.filter(
      (listing) => listing.priceUsdc <= filters.maxPriceUsdc
    );
  }

  if (filters.cursor) {
    const cursorIndex = results.findIndex(
      (listing) => listing.id === filters.cursor
    );
    if (cursorIndex >= 0) {
      results = results.slice(cursorIndex + 1);
    }
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const page = results.slice(0, limit);
  const hasMore = results.length > limit;

  return {
    listings: page,
    count: page.length,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** @param {string} id */
export function getById(id) {
  return store.getById(id);
}
