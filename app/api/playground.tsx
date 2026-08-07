"use client";

import Link from "next/link";
import { useState } from "react";
import { addListing, loadListings, type AddResult } from "@/lib/store";
import styles from "./api.module.css";

type Mode = "get" | "post";

interface PlaygroundResponse {
  status: string;
  ok: boolean;
  body: string;
}

const DEFAULT_BODY = `{
  "event": "Neon Harbor Festival, day pass",
  "date": "2026-10-03",
  "venue": "Pier 70, San Francisco",
  "price": 210
}`;

export function Playground() {
  const [mode, setMode] = useState<Mode>("get");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);

  function send() {
    if (mode === "get") {
      const listings = loadListings().map((l) => ({
        id: l.id,
        event: l.event,
        date: l.date,
        venue: l.venue,
        price: l.price,
        source: l.source,
      }));
      setResponse({ status: "200 OK", ok: true, body: JSON.stringify({ listings }, null, 2) });
      return;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    const res: AddResult =
      parsed === null
        ? {
            ok: false,
            status: 400,
            errors: [{ field: "body", code: "INVALID_JSON", message: "Request body must be a JSON object." }],
          }
        : addListing(parsed, "agent", "playground");
    if (res.ok) {
      setResponse({
        status: "201 Created",
        ok: true,
        body: JSON.stringify({ listing: res.listing }, null, 2),
      });
    } else {
      setResponse({
        status: "400 Bad Request",
        ok: false,
        body: JSON.stringify({ errors: res.errors }, null, 2),
      });
    }
  }

  return (
    <section id="playground">
      <div className="section-head">
        <span className="overline">Playground</span>
        <h2 className="h2">Try it, live</h2>
        <p className="sub">
          This playground runs against the same live inventory as the listings page. POST a ticket
          here, then open <Link href="/listings">Listings</Link> and it&apos;s there.
        </p>
      </div>
      <div className={styles.play}>
        <div className={`card ${styles.playPanel}`}>
          <div className="pill-tabs">
            <button
              className={`pill-tab${mode === "get" ? " active" : ""}`}
              type="button"
              onClick={() => setMode("get")}
            >
              GET /api/listings
            </button>
            <button
              className={`pill-tab${mode === "post" ? " active" : ""}`}
              type="button"
              onClick={() => setMode("post")}
            >
              POST /api/listings
            </button>
          </div>
          {mode === "post" && (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              aria-label="Request body"
            />
          )}
          <button className="btn btn-primary" type="button" onClick={send}>
            Send request
          </button>
        </div>
        <div className={styles.playPanel}>
          <div className="code-label">
            <span>Response</span>
            <span className={`${styles.status}${response ? ` ${response.ok ? styles.ok : styles.bad}` : ""}`}>
              {response?.status ?? ""}
            </span>
          </div>
          <pre className={`code ${styles.resp}`}>
            {response ? response.body : <span className="c">Send a request to see the response.</span>}
          </pre>
        </div>
      </div>
    </section>
  );
}
