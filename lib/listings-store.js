/** @type {Map<string, import('./listings-service.js').Listing>} */
const store = new Map();

/** @param {import('./listings-service.js').Listing} listing */
export function insert(listing) {
  store.set(listing.id, listing);
  return listing;
}

/** @returns {import('./listings-service.js').Listing[]} */
export function all() {
  return Array.from(store.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** @param {string} id */
export function getById(id) {
  return store.get(id);
}
