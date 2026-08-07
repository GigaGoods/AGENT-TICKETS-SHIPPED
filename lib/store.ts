// Client-side listing store backed by localStorage.
//
// This is the V1 demo data layer: the web UI and the API playground read and
// write the same key, so a listing created anywhere shows up everywhere
// (including across tabs, via the `storage` event). The validation contract —
// field names, error codes, messages — is the same one the real
// `/api/listings` route handlers will expose, so agent-facing behavior is
// defined here once.

export type ListingSource = "human" | "agent";

export interface Listing {
  id: string;
  event: string;
  date: string; // YYYY-MM-DD
  venue: string;
  price: number; // whole USDC for the demo listings
  source: ListingSource;
  agent?: string;
  ts: number;
  status?: "escrow";
  // Seller's proof of purchase passed document verification (POST /api/verify).
  verified?: boolean;
}

export type ValidationCode =
  | "MISSING_FIELD"
  | "INVALID_DATE"
  | "INVALID_PRICE"
  | "INVALID_JSON";

export interface ValidationError {
  field: string;
  code: ValidationCode;
  message: string;
}

export type AddResult =
  | { ok: true; status: 201; listing: Listing }
  | { ok: false; status: 400; errors: ValidationError[] };

export const STORAGE_KEY = "at_listings_v1";

function seed(): Listing[] {
  const now = Date.now();
  return [
    { id: "lst_9f2k1", event: "Silverline Tour", date: "2026-09-18", venue: "The Anthem, Washington DC", price: 145, source: "human", ts: now - 86400e3 * 2, verified: true },
    { id: "lst_4h8m3", event: "FC Cascadia vs Rose City", date: "2026-09-05", venue: "Providence Park, Portland", price: 88, source: "agent", agent: "seatscout-2", ts: now - 86400e3 },
    { id: "lst_7q1x9", event: "Neon Harbor Festival, day pass", date: "2026-10-03", venue: "Pier 70, San Francisco", price: 210, source: "human", ts: now - 3600e3 * 20 },
    { id: "lst_2b6v4", event: "La Boheme", date: "2026-11-14", venue: "War Memorial Opera House, San Francisco", price: 120, source: "agent", agent: "operabot", ts: now - 3600e3 * 6 },
    { id: "lst_5n3c8", event: "Midnight Parade", date: "2026-09-27", venue: "Brooklyn Steel, New York", price: 95, source: "human", ts: now - 3600e3 * 2 },
  ];
}

export function loadListings(): Listing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Listing[];
  } catch {
    // fall through to seed
  }
  return seed();
}

export function saveListings(list: Listing[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private mode, quota) — demo data just won't persist
  }
}

export function validateListing(body: unknown): ValidationError[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return [{ field: "body", code: "INVALID_JSON", message: "Request body must be a JSON object." }];
  }
  const b = body as Record<string, unknown>;
  const errors: ValidationError[] = [];
  if (typeof b.event !== "string" || !b.event.trim()) {
    errors.push({ field: "event", code: "MISSING_FIELD", message: "event is required and must be a non empty string." });
  }
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) {
    errors.push({ field: "date", code: "INVALID_DATE", message: "date is required in YYYY-MM-DD format." });
  }
  if (typeof b.venue !== "string" || !b.venue.trim()) {
    errors.push({ field: "venue", code: "MISSING_FIELD", message: "venue is required and must be a non empty string." });
  }
  const price = Number(b.price);
  if (b.price === undefined || b.price === null || b.price === "" || Number.isNaN(price) || price <= 0) {
    errors.push({ field: "price", code: "INVALID_PRICE", message: "price is required and must be a number greater than 0 (USDC)." });
  }
  return errors;
}

export function addListing(
  body: unknown,
  source: ListingSource = "human",
  agent?: string,
  verified = false,
): AddResult {
  const errors = validateListing(body);
  if (errors.length) return { ok: false, status: 400, errors };
  const b = body as Record<string, unknown>;
  const listing: Listing = {
    id: "lst_" + Math.random().toString(36).slice(2, 7),
    event: (b.event as string).trim(),
    date: String(b.date),
    venue: (b.venue as string).trim(),
    price: Number(b.price),
    source,
    ts: Date.now(),
  };
  if (verified) listing.verified = true;
  if (source === "agent") listing.agent = agent ?? "agent";
  const list = loadListings();
  list.unshift(listing);
  saveListings(list);
  return { ok: true, status: 201, listing };
}

export function getListing(id: string | null): Listing | undefined {
  if (!id) return undefined;
  return loadListings().find((l) => l.id === id);
}

export function buyListing(id: string): Listing | undefined {
  const list = loadListings();
  const listing = list.find((l) => l.id === id);
  if (listing && listing.status !== "escrow") {
    listing.status = "escrow";
    saveListings(list);
  }
  return listing;
}

export function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1e3;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " hr ago";
  return Math.floor(s / 86400) + " d ago";
}

export function formatEventDate(date: string): string {
  const dt = new Date(date + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
