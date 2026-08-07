"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { buyListing } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import { ListingCard } from "@/components/listing-card";
import { CheckIcon } from "@/components/icons";
import styles from "./buy.module.css";

type PayMethod = "usdc" | "card";

const STEPS = [
  { n: 1, label: "Review" },
  { n: 2, label: "Fund escrow" },
  { n: 3, label: "Done" },
] as const;

export function BuyClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { listings } = useListings();
  // null until hydration completes — listings come from localStorage.
  const listing = listings ? (listings.find((l) => l.id === id) ?? listings[0] ?? null) : null;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pay, setPay] = useState<PayMethod>("usdc");

  function fund() {
    if (listing) buyListing(listing.id);
    setStep(3);
  }

  return (
    <main className={styles.page}>
      <section>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <span key={s.n} className={`${styles.stepDot}${s.n <= step ? ` ${styles.on}` : ""}`}>
              <i>{s.n}</i>
              {s.label}
            </span>
          ))}
        </div>
        {step === 1 && (
          <div className={styles.pane}>
            <h1 className="h2">Review your ticket</h1>
            <div>{listing && <ListingCard listing={listing} showBuy={false} />}</div>
            <div className={styles.notice}>
              Preview of the designed escrow flow. The Solana USDC escrow spec is committed in the
              repo and is not live yet.
            </div>
            <div>
              <button className="btn btn-primary" type="button" onClick={() => setStep(2)}>
                Continue to escrow
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className={styles.pane}>
            <h1 className="h2">Fund the escrow</h1>
            <label className={`${styles.payOpt}${pay === "usdc" ? ` ${styles.sel}` : ""}`}>
              <input
                type="radio"
                name="pay"
                value="usdc"
                checked={pay === "usdc"}
                onChange={() => setPay("usdc")}
              />
              <span>
                <b>Pay with USDC</b>
                <span>Straight from your Solana wallet into the escrow account.</span>
              </span>
            </label>
            <label className={`${styles.payOpt}${pay === "card" ? ` ${styles.sel}` : ""}`}>
              <input
                type="radio"
                name="pay"
                value="card"
                checked={pay === "card"}
                onChange={() => setPay("card")}
              />
              <span>
                <b>Pay with card</b>
                <span>Stripe checkout, converted to USDC via Crossmint, then into the same escrow.</span>
              </span>
            </label>
            <div>
              <button className="btn btn-primary" type="button" onClick={fund}>
                Fund escrow
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className={`${styles.pane} ${styles.paneDone}`}>
            <div className={styles.doneIcon}>
              <CheckIcon className="" />
            </div>
            <h1 className="h2">Escrow funded</h1>
            <p className="sub" style={{ maxWidth: 440 }}>
              Your funds are held in escrow, not by the seller. When the seller transfers the
              ticket, the escrow releases automatically. If they don&apos;t, you&apos;re refunded.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btn-primary" href="/listings">
                Back to listings
              </Link>
              <Link className="btn btn-secondary" href="/trust">
                How escrow protects you
              </Link>
            </div>
          </div>
        )}
      </section>
      <aside className={`card ${styles.summary}`}>
        <span className="overline">Order summary</span>
        <div className={styles.row}>
          <span>{listing ? listing.event : "–"}</span>
        </div>
        <div className={styles.row}>
          <span>Ticket price</span>
          <span>{listing ? `${listing.price} USDC` : "–"}</span>
        </div>
        <div className={styles.row}>
          <span>Marketplace fee</span>
          <span>0 USDC</span>
        </div>
        <div className={`${styles.row} ${styles.total}`}>
          <span>Held in escrow</span>
          <span>{listing ? `${listing.price} USDC` : "–"}</span>
        </div>
        <ul className={styles.timeline}>
          <li>
            <i>1</i>You fund the escrow (USDC or card)
          </li>
          <li>
            <i>2</i>Seller transfers the ticket to you
          </li>
          <li>
            <i>3</i>Escrow releases to the seller
          </li>
        </ul>
      </aside>
    </main>
  );
}
