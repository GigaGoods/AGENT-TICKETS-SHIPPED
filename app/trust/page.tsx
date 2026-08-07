import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import styles from "./trust.module.css";

export const metadata: Metadata = {
  title: "Trust & escrow",
};

export default function TrustPage() {
  return (
    <main>
      <section className={`${styles.hero} container`}>
        <span className="badge badge-teal">Trust &amp; safety</span>
        <h1 className="h-display" style={{ fontSize: "clamp(36px,5vw,60px)" }}>
          Neither side has to trust the other. That&apos;s the point.
        </h1>
        <p className="sub">
          P2P resale today happens in DMs and group chats with zero protection. Agent-Tickets
          replaces &quot;send first and hope&quot; with a USDC escrow on Solana that holds the money
          until the ticket moves.
        </p>
      </section>

      <section className="section-tight container">
        <div className={styles.flowGrid}>
          <div className={`card-feature tint-yellow ${styles.flow}`}>
            <span className={styles.num}>01</span>
            <h3>Buyer funds escrow</h3>
            <p>
              Pay in USDC from a wallet, or with a card through Stripe, converted to USDC via
              Crossmint. Either way the funds land in the escrow account, not with the seller.
            </p>
          </div>
          <div className={`card-feature tint-teal ${styles.flow}`}>
            <span className={styles.num}>02</span>
            <h3>Seller transfers the ticket</h3>
            <p>
              The seller hands over the ticket knowing the money is already locked. No chasing a
              stranger for payment after the fact.
            </p>
          </div>
          <div className={`card-feature tint-rose ${styles.flow}`}>
            <span className={styles.num}>03</span>
            <h3>Escrow releases, or refunds</h3>
            <p>
              On transfer, the escrow releases to the seller automatically. If the ticket never
              moves, the buyer is refunded. Code decides, not a support queue.
            </p>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section-head">
          <span className="overline">Who&apos;s protected</span>
          <h2 className="h1">Both sides, by design</h2>
        </div>
        <div className={styles.sides}>
          <div className="card">
            <h3 className="h4" style={{ marginBottom: 16 }}>
              If you&apos;re buying
            </h3>
            <ul>
              <li>
                <CheckIcon className="" />
                Your money never touches the seller until the ticket is yours.
              </li>
              <li>
                <CheckIcon className="" />
                Automatic refund if the transfer never happens.
              </li>
              <li>
                <CheckIcon className="" />
                Prices in plain USDC. No 20 to 30% platform markup buried in fees.
              </li>
            </ul>
          </div>
          <div className="card">
            <h3 className="h4" style={{ marginBottom: 16 }}>
              If you&apos;re selling
            </h3>
            <ul>
              <li>
                <CheckIcon className="" />
                You see the funds locked in escrow before you transfer anything.
              </li>
              <li>
                <CheckIcon className="" />
                Release is automatic on transfer. No waiting on payouts.
              </li>
              <li>
                <CheckIcon className="" />
                No chargebacks landing on you weeks later.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section-tight container">
        <div className="cta-dark">
          <span className="badge badge-yellow">Status</span>
          <h2 className="h1">The escrow layer is designed, not yet live.</h2>
          <p className="sub" style={{ maxWidth: 560 }}>
            The full Solana/Anchor USDC escrow spec is committed in the repo and slots onto the
            live listing rail next. Today, listings and the agent API are live; settlement is a
            design doc you can read.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <a className="btn btn-on-dark" href="https://github.com/GigaGoods/AGENT-TICKETS">
              Read the spec on GitHub
            </a>
            <Link
              className="btn btn-secondary"
              style={{ color: "#fff", borderColor: "rgb(255 255 255 / 0.4)" }}
              href="/buy"
            >
              Preview the buy flow
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
