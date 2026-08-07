import type { Metadata } from "next";
import { Playground } from "./playground";
import styles from "./api.module.css";

export const metadata: Metadata = {
  title: "Agent API",
};

export default function AgentApiPage() {
  return (
    <main className={`container ${styles.page}`}>
      <section className={styles.pageHead}>
        <span className="badge badge-agent">Agent front door</span>
        <h1 className="h1">The same inventory, one JSON call away.</h1>
        <p className="sub">
          Three endpoints. No auth for the demo, no SDK, no scraping. What an agent writes here
          shows up on the listings page for everyone, instantly — and proof-of-purchase documents
          are checked by a real vision model before a listing earns its verified badge.
        </p>
      </section>

      <section className={styles.docs}>
        <div className={`card ${styles.endpoint}`}>
          <div className={styles.sig}>
            <span className={`${styles.method} ${styles.get}`}>GET</span>
            <code>/api/listings</code>
          </div>
          <p className="small">Read the full live inventory. Same data the web page renders.</p>
          <div>
            <div className="code-label">200 OK</div>
            <pre className="code">
              {"{\n  "}
              <span className="k">{'"listings"'}</span>
              {": [\n    {\n      "}
              <span className="k">{'"id"'}</span>
              {": "}
              <span className="g">{'"lst_9f2k1"'}</span>
              {",\n      "}
              <span className="k">{'"event"'}</span>
              {": "}
              <span className="g">{'"Silverline Tour"'}</span>
              {",\n      "}
              <span className="k">{'"date"'}</span>
              {": "}
              <span className="g">{'"2026-09-18"'}</span>
              {",\n      "}
              <span className="k">{'"venue"'}</span>
              {": "}
              <span className="g">{'"The Anthem, Washington DC"'}</span>
              {",\n      "}
              <span className="k">{'"price"'}</span>
              {": "}
              <span className="y">145</span>
              {",\n      "}
              <span className="k">{'"source"'}</span>
              {": "}
              <span className="g">{'"human"'}</span>
              {"\n    }\n  ]\n}"}
            </pre>
          </div>
        </div>
        <div className={`card ${styles.endpoint}`}>
          <div className={styles.sig}>
            <span className={`${styles.method} ${styles.post}`}>POST</span>
            <code>/api/listings</code>
          </div>
          <p className="small">
            Create a listing. Four fields, price in USDC. Returns 201 with the stored listing, or
            400 with machine readable errors.
          </p>
          <div>
            <div className="code-label">Request body</div>
            <pre className="code">
              {"{\n  "}
              <span className="k">{'"event"'}</span>
              {": "}
              <span className="g">{'"La Boheme"'}</span>
              {",\n  "}
              <span className="k">{'"date"'}</span>
              {": "}
              <span className="g">{'"2026-11-14"'}</span>
              {",\n  "}
              <span className="k">{'"venue"'}</span>
              {": "}
              <span className="g">{'"War Memorial Opera House"'}</span>
              {",\n  "}
              <span className="k">{'"price"'}</span>
              {": "}
              <span className="y">120</span>
              {"\n}"}
            </pre>
          </div>
          <div>
            <div className="code-label">400 Bad Request</div>
            <pre className="code">
              {"{\n  "}
              <span className="k">{'"errors"'}</span>
              {": [\n    { "}
              <span className="k">{'"field"'}</span>
              {": "}
              <span className="g">{'"price"'}</span>
              {", "}
              <span className="k">{'"code"'}</span>
              {": "}
              <span className="g">{'"INVALID_PRICE"'}</span>
              {" }\n  ]\n}"}
            </pre>
          </div>
        </div>
        <div className={`card ${styles.endpoint}`}>
          <div className={styles.sig}>
            <span className={`${styles.method} ${styles.post}`}>POST</span>
            <code>/api/verify</code>
          </div>
          <p className="small">
            Check a proof-of-purchase document against listing details. This one is live — Gemini
            reads the document server-side and cross-checks event, date, and venue. Returns 503
            when no vision API key is configured.
          </p>
          <div>
            <div className="code-label">Request body</div>
            <pre className="code">
              {"{\n  "}
              <span className="k">{'"documentBase64"'}</span>
              {": "}
              <span className="g">{'"<base64 PNG, JPEG, WebP or PDF>"'}</span>
              {",\n  "}
              <span className="k">{'"mimeType"'}</span>
              {": "}
              <span className="g">{'"image/png"'}</span>
              {",\n  "}
              <span className="k">{'"listing"'}</span>
              {": {\n    "}
              <span className="k">{'"eventName"'}</span>
              {": "}
              <span className="g">{'"La Boheme"'}</span>
              {",\n    "}
              <span className="k">{'"eventDate"'}</span>
              {": "}
              <span className="g">{'"2026-11-14"'}</span>
              {",\n    "}
              <span className="k">{'"venue"'}</span>
              {": "}
              <span className="g">{'"War Memorial Opera House"'}</span>
              {"\n  }\n}"}
            </pre>
          </div>
          <div>
            <div className="code-label">200 OK</div>
            <pre className="code">
              {"{\n  "}
              <span className="k">{'"ok"'}</span>
              {": "}
              <span className="y">true</span>
              {",\n  "}
              <span className="k">{'"verification"'}</span>
              {": {\n    "}
              <span className="k">{'"status"'}</span>
              {": "}
              <span className="g">{'"verified"'}</span>
              {",  "}
              <span className="c">{"// or rejected | needs_review"}</span>
              {"\n    "}
              <span className="k">{'"confidence"'}</span>
              {": "}
              <span className="y">0.92</span>
              {",\n    "}
              <span className="k">{'"fieldMatches"'}</span>
              {": [ "}
              <span className="c">{"…per-field results…"}</span>
              {" ]\n  }\n}"}
            </pre>
          </div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <span className="overline">Validation</span>
          <h2 className="h2">Errors an agent can act on</h2>
          <p className="sub">
            Every 400 names the field and a stable code, so an agent caller can correct itself and
            retry without a human.
          </p>
        </div>
        <div className="card" style={{ padding: "8px 12px" }}>
          <table className={styles.errTable}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Field</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>MISSING_FIELD</code>
                </td>
                <td>event, venue</td>
                <td>Required and must be a non empty string.</td>
              </tr>
              <tr>
                <td>
                  <code>INVALID_DATE</code>
                </td>
                <td>date</td>
                <td>Required, in YYYY-MM-DD format.</td>
              </tr>
              <tr>
                <td>
                  <code>INVALID_PRICE</code>
                </td>
                <td>price</td>
                <td>Required, a number greater than 0, denominated in USDC.</td>
              </tr>
              <tr>
                <td>
                  <code>INVALID_JSON</code>
                </td>
                <td>body</td>
                <td>The request body must parse as a JSON object.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <Playground />
    </main>
  );
}
