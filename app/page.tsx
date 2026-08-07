import Link from "next/link";
import { HomePreview } from "@/components/home-preview";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <main>
      <section className={`${styles.hero} container`}>
        <span className="badge badge-yellow">Peer to peer tickets, settled in USDC</span>
        <h1 className="h-display">One marketplace. Two front doors.</h1>
        <p className="sub">
          A human lists a ticket with a simple form. An AI agent lists or reads inventory with a
          single JSON call. Both see the same live listings, instantly.
        </p>
        <div className={styles.heroCtas}>
          <Link className="btn btn-primary" href="/listings">
            Browse live listings
          </Link>
          <Link className="btn btn-secondary" href="/api">
            Read the agent API
          </Link>
        </div>
        <div className="mockup" style={{ width: "100%", maxWidth: 1000, marginTop: 24 }}>
          <div className={styles.board}>
            <div className={styles.mini}>
              <span className="badge badge-human">Human listed</span>
              <h4>Silverline Tour</h4>
              <span className="small">Fri, Sep 18 · The Anthem, Washington DC</span>
              <span className="price">
                145 <small>USDC</small>
              </span>
            </div>
            <pre className="code">
              {"POST /api/listings\n"}
              <span className="c">{"{"}</span>
              {"\n  "}
              <span className="k">{'"event"'}</span>
              {": "}
              <span className="g">{'"FC Cascadia vs Rose City"'}</span>
              {",\n  "}
              <span className="k">{'"price"'}</span>
              {": "}
              <span className="y">88</span>
              {"\n"}
              <span className="c">{"}"}</span>
              {"\n"}
              <span className="c">{"→ 201 Created"}</span>
            </pre>
            <div className={styles.mini}>
              <span className="badge badge-agent">Agent listed</span>
              <h4>FC Cascadia vs Rose City</h4>
              <span className="small">Sat, Sep 5 · Providence Park, Portland</span>
              <span className="price">
                88 <small>USDC</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight container">
        <div className="stat-row">
          <div className="stat">
            <b>20–30%</b>
            <span>
              what resale platforms take in combined fees. Agent-Tickets is built to undercut that
              with escrow.
            </span>
          </div>
          <div className="stat">
            <b>2</b>
            <span>front doors, one inventory: a web form for people, a JSON API for agents.</span>
          </div>
          <div className="stat">
            <b>&lt;30s</b>
            <span>from form submit or API call to a live listing everyone can see.</span>
          </div>
        </div>
      </section>

      <section className="section container" id="how">
        <div className="section-head">
          <span className="overline">How it works</span>
          <h2 className="h1">Agents are users, not scrapers.</h2>
        </div>
        <div className={styles.hiwGrid}>
          <div className={`card-feature tint-yellow ${styles.hiw}`}>
            <span className={styles.num}>01</span>
            <h3>List a ticket</h3>
            <p>Event name, date, venue, price in USDC. One short form, no account gymnastics.</p>
          </div>
          <div className={`card-feature tint-rose ${styles.hiw}`}>
            <span className={styles.num}>02</span>
            <h3>Or let your agent do it</h3>
            <p>
              POST /api/listings with the same four fields. Agents hit the exact same inventory as
              the web form.
            </p>
          </div>
          <div className={`card-feature tint-teal ${styles.hiw}`}>
            <span className={styles.num}>03</span>
            <h3>Everyone sees it live</h3>
            <p>
              New tickets appear instantly on the listings page and in GET /api/listings, for
              humans and agents alike.
            </p>
          </div>
          <div className={`card-feature tint-coral ${styles.hiw}`}>
            <span className={styles.num}>04</span>
            <h3>Settle in escrow next</h3>
            <p>
              The Solana USDC escrow layer is fully designed and slots onto this listing rail.
              Buyer funds escrow, release on transfer.
            </p>
          </div>
        </div>
      </section>

      <section className="section-tight container">
        <div className={styles.previewHead}>
          <div>
            <span className="overline">Live now</span>
            <h2 className="h2" style={{ marginTop: 8 }}>
              Fresh listings
            </h2>
          </div>
          <Link className="btn btn-secondary btn-sm" href="/listings">
            See all listings
          </Link>
        </div>
        <HomePreview />
      </section>

      <section className="section container" id="roadmap">
        <div className="section-head">
          <span className="overline">Scope</span>
          <h2 className="h1">What&apos;s live, what&apos;s designed, what&apos;s later.</h2>
        </div>
        <div className={styles.roadGrid}>
          <div className={`card ${styles.road} ${styles.live}`}>
            <span className="badge badge-success">Live now</span>
            <ul>
              <li>Live listings page, updates instantly</li>
              <li>Web form listing: event, date, venue, price in USDC</li>
              <li>Agent JSON API: POST and GET /api/listings</li>
              <li>Machine readable validation errors so agents self correct</li>
            </ul>
          </div>
          <div className={`card ${styles.road}`}>
            <span className="badge badge-yellow">Designed, in the repo</span>
            <ul>
              <li>USDC escrow on Solana (Anchor)</li>
              <li>Buyer funds escrow at purchase</li>
              <li>Release to seller on ticket transfer</li>
              <li>Spec committed as a design doc</li>
            </ul>
          </div>
          <div className={`card ${styles.road}`}>
            <span className="badge badge-human">Later</span>
            <ul>
              <li>MCP server wrapper for agents</li>
              <li>Fiat onramp, disputes, KYC</li>
              <li>Native NFT ticket issuance</li>
              <li>Venue and door verification</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section-tight container" id="faq" style={{ maxWidth: 800 }}>
        <div className="section-head">
          <span className="overline">FAQ</span>
          <h2 className="h1">Questions</h2>
        </div>
        <div className="faq">
          <details>
            <summary>Who can list a ticket?</summary>
            <p>
              Anyone. A person uses the web form. An AI agent calls POST /api/listings. Both write
              to the same live inventory and both show up everywhere within seconds.
            </p>
          </details>
          <details>
            <summary>Why let agents transact at all?</summary>
            <p>
              Every resale checkout today assumes a human clicking a webpage. As shopping agents
              become normal, the marketplace that treats them as first class users gets their
              inventory and their demand.
            </p>
          </details>
          <details>
            <summary>Is the escrow live?</summary>
            <p>
              Not yet. The Solana USDC escrow settlement layer is fully designed, with the spec
              committed in the repo. It slots onto this listing rail next.
            </p>
          </details>
          <details>
            <summary>What happens when an agent sends bad input?</summary>
            <p>
              Validation returns machine readable errors with a field and an error code, so an
              agent can read the response and correct its own request without a human in the loop.
            </p>
          </details>
          <details>
            <summary>What about disputes, KYC and fiat?</summary>
            <p>Out of scope for V1. Listings first, settlement next, everything else after.</p>
          </details>
        </div>
      </section>

      <section className="section container">
        <div className="cta-dark">
          <h2 className="h1">Your agent can list a ticket before you finish reading this.</h2>
          <p className="sub">One POST. Live for everyone in under 30 seconds.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Link className="btn btn-on-dark" href="/api">
              Try the API playground
            </Link>
            <Link
              className="btn btn-secondary"
              style={{ color: "#fff", borderColor: "rgb(255 255 255 / 0.4)" }}
              href="/listings#sell"
            >
              List one yourself
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
