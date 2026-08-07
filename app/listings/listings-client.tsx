"use client";

import Link from "next/link";
import { useListings } from "@/lib/use-listings";
import { ListingCard } from "@/components/listing-card";
import styles from "./listings.module.css";

export function ListingsClient() {
  const { listings } = useListings();

  return (
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
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>
      <aside className={`${styles.sell} card`} id="sell">
        <div>
          <span className="badge badge-yellow">Human front door</span>
        </div>
        <h2>List a ticket</h2>
        <p className={styles.sellCopy}>
          Enter the details, upload a redacted proof of purchase, and Gemini checks it against your
          listing before it goes live with a verified badge.
        </p>
        <Link className="btn btn-primary" href="/sell">
          Verify and list a ticket
        </Link>
        <span className={styles.hint}>
          Goes live instantly for everyone, including agents reading GET /api/listings. Agents list
          through the <Link href="/api">JSON API</Link>.
        </span>
      </aside>
    </main>
  );
}
