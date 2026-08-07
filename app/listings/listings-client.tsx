"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { addListing } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import { ListingCard } from "@/components/listing-card";
import styles from "./listings.module.css";

const FIELDS = [
  { name: "event", label: "Event name", type: "text", placeholder: "Silverline Tour", error: "Event name is required." },
  { name: "date", label: "Event date", type: "date", placeholder: undefined, error: "A valid date is required." },
  { name: "venue", label: "Venue", type: "text", placeholder: "The Anthem, Washington DC", error: "Venue is required." },
  { name: "price", label: "Price (USDC)", type: "number", placeholder: "145", error: "Price must be a number greater than 0." },
] as const;

export function ListingsClient() {
  const { listings, refresh } = useListings();
  const [newId, setNewId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const body = {
      event: String(data.get("event") ?? ""),
      date: String(data.get("date") ?? ""),
      venue: String(data.get("venue") ?? ""),
      price: String(data.get("price") ?? ""),
    };
    const res = addListing(body, "human");
    if (!res.ok) {
      setInvalid(new Set(res.errors.map((err) => err.field)));
      return;
    }
    setInvalid(new Set());
    form.reset();
    refresh();
    setNewId(res.listing.id);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2500);
  }

  return (
    <>
      <main className={`container ${styles.page}`}>
        <section>
          <div className={styles.pageHead}>
            <h1 className="h1">Live listings</h1>
            <span className={styles.liveDot}>
              <i />
              <span>{listings ? `${listings.length} tickets live` : ""}</span>
            </span>
          </div>
          <div className="listing-grid">
            {(listings ?? []).map((listing) => (
              <ListingCard key={listing.id} listing={listing} isNew={listing.id === newId} />
            ))}
          </div>
        </section>
        <aside className={`${styles.sell} card`} id="sell">
          <div>
            <span className="badge badge-yellow">Human front door</span>
          </div>
          <h2>List a ticket</h2>
          <form onSubmit={onSubmit} noValidate>
            {FIELDS.map((field) => (
              <div key={field.name} className={`field${invalid.has(field.name) ? " invalid" : ""}`}>
                <label htmlFor={`f-${field.name}`}>{field.label}</label>
                <input
                  id={`f-${field.name}`}
                  name={field.name}
                  type={field.type}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  min={field.type === "number" ? 1 : undefined}
                  step={field.type === "number" ? 1 : undefined}
                />
                <span className="error">{field.error}</span>
              </div>
            ))}
            <button className="btn btn-primary" type="submit">
              Publish listing
            </button>
            <span className={styles.hint}>
              Goes live instantly for everyone, including agents reading GET /api/listings. Agents
              list through the <Link href="/api">JSON API</Link>.
            </span>
          </form>
        </aside>
      </main>
      <div className={`${styles.toast}${toast ? ` ${styles.show}` : ""}`}>
        Listing published. It&apos;s live.
      </div>
    </>
  );
}
