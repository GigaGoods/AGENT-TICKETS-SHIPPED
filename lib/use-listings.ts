"use client";

import { useSyncExternalStore } from "react";
import { loadListings, STORAGE_KEY, type Listing } from "@/lib/store";

// Listings live in localStorage, so they only exist on the client: `listings`
// is null during SSR and the hydration render, then fills in. Cross-tab
// updates arrive via the `storage` event; same-tab writes must call
// `refresh()` (the storage event never fires in the tab that wrote).

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  listeners.add(callback);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function notifyListingsChanged(): void {
  for (const listener of listeners) listener();
}

// getSnapshot must return a referentially stable value while the underlying
// data is unchanged, so cache the parsed list keyed on the raw string.
let cachedRaw: string | null = null;
let cachedList: Listing[] | null = null;

function getSnapshot(): Listing[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable — fall through to the seed data below
  }
  if (cachedList === null || raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = loadListings();
  }
  return cachedList;
}

function getServerSnapshot(): Listing[] | null {
  return null;
}

export function useListings(): { listings: Listing[] | null; refresh: () => void } {
  const listings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { listings, refresh: notifyListingsChanged };
}
