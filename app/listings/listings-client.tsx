"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { addListing } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import {
  MAX_DOCUMENT_BYTES,
  verifyDocument,
  type VerificationResult,
} from "@/lib/verification";
import { ListingCard } from "@/components/listing-card";
import styles from "./listings.module.css";

const FIELDS = [
  { name: "event", label: "Event name", type: "text", placeholder: "Silverline Tour", error: "Event name is required." },
  { name: "date", label: "Event date", type: "date", placeholder: undefined, error: "A valid date is required." },
  { name: "venue", label: "Venue", type: "text", placeholder: "The Anthem, Washington DC", error: "Venue is required." },
  { name: "price", label: "Price (USDC)", type: "number", placeholder: "145", error: "Price must be a number greater than 0." },
] as const;

// Proof-of-purchase verification states. "approved" is the demo-only manual
// override for needs_review results; "unavailable" means the server has no
// vision API key, so publishing proceeds unverified.
type VerifyState =
  | "idle"
  | "ready"
  | "checking"
  | "verified"
  | "review"
  | "approved"
  | "rejected"
  | "error"
  | "unavailable";

const PROOF_BADGE: Record<VerifyState, { label: string; tone: string }> = {
  idle: { label: "Not submitted", tone: "badge-human" },
  ready: { label: "Ready", tone: "badge-yellow" },
  checking: { label: "Checking…", tone: "badge-yellow" },
  verified: { label: "Verified", tone: "badge-success" },
  review: { label: "Needs review", tone: "badge-yellow" },
  approved: { label: "Demo approved", tone: "badge-teal" },
  rejected: { label: "Rejected", tone: "badge-coral" },
  error: { label: "Error", tone: "badge-coral" },
  unavailable: { label: "Unavailable", tone: "badge-human" },
};

export function ListingsClient() {
  const { listings, refresh } = useListings();
  const [newId, setNewId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  function acceptFile(next: File | null | undefined) {
    if (!next) return;
    if (next.size > MAX_DOCUMENT_BYTES) {
      showToast("That file is over the 8 MB upload limit.");
      return;
    }
    setFile(next);
    setResult(null);
    setVerifyNote(null);
    setVerifyState("ready");
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragover(false);
    acceptFile(e.dataTransfer.files[0]);
  }

  // Editing listing details invalidates a completed verification — the
  // document was checked against the old values.
  function onFormChange(e: ChangeEvent<HTMLFormElement>) {
    // e.target is the input that fired, not the form React types it as.
    const target = e.target as unknown as HTMLInputElement;
    if (target.type === "file") return;
    if (["verified", "review", "approved", "rejected"].includes(verifyState)) {
      setVerifyState(file ? "ready" : "idle");
      setResult(null);
      setVerifyNote("Details changed — verify the document again before publishing.");
    }
  }

  async function onVerify() {
    if (!file || !formRef.current || verifyState === "checking") return;
    const data = new FormData(formRef.current);
    const listing = {
      eventName: String(data.get("event") ?? ""),
      eventDate: String(data.get("date") ?? ""),
      venue: String(data.get("venue") ?? ""),
      priceUsdc: Number(data.get("price")) || undefined,
    };
    if (!listing.eventName.trim() || !listing.eventDate || !listing.venue.trim()) {
      showToast("Fill in event, date, and venue first — the document is checked against them.");
      return;
    }

    setVerifyState("checking");
    setVerifyNote(null);
    const outcome = await verifyDocument(file, listing);

    if (!outcome.ok) {
      if (outcome.unavailable) {
        setVerifyState("unavailable");
        setVerifyNote(
          "Verification is offline (no GOOGLE_API_KEY on the server). You can still publish — the listing just won't carry the verified badge.",
        );
      } else {
        setVerifyState("error");
        setVerifyNote(`Verification failed: ${outcome.error}`);
      }
      return;
    }

    const verification = outcome.verification;
    setResult(verification);
    if (verification.status === "verified") {
      setVerifyState("verified");
      showToast("Gemini matched your document to the listing. Ready to publish.");
    } else if (verification.status === "needs_review") {
      setVerifyState("review");
      showToast(verification.reviewReasons[0] ?? "Ticket detected — manual review required.");
    } else {
      setVerifyState("rejected");
      showToast(verification.rejectionReason ?? "The document did not match the listing details.");
    }
  }

  const canPublish = ["verified", "approved", "unavailable"].includes(verifyState);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canPublish) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const body = {
      event: String(data.get("event") ?? ""),
      date: String(data.get("date") ?? ""),
      venue: String(data.get("venue") ?? ""),
      price: String(data.get("price") ?? ""),
    };
    const res = addListing(body, "human", undefined, verifyState === "verified");
    if (!res.ok) {
      setInvalid(new Set(res.errors.map((err) => err.field)));
      return;
    }
    setInvalid(new Set());
    form.reset();
    setFile(null);
    setResult(null);
    setVerifyNote(null);
    setVerifyState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    refresh();
    setNewId(res.listing.id);
    showToast(
      res.listing.verified
        ? "Verified listing published. It's live."
        : "Listing published unverified. It's live.",
    );
  }

  const proofBadge = PROOF_BADGE[verifyState];
  const verifyLabel =
    verifyState === "checking"
      ? "Analyzing document…"
      : verifyState === "verified"
        ? "Document verified ✓"
        : verifyState === "approved"
          ? "Demo review recorded ✓"
          : verifyState === "rejected" || verifyState === "review"
            ? "Verify another document"
            : verifyState === "error"
              ? "Retry verification"
              : "Verify document";
  const publishLabel = !canPublish
    ? "Verify proof to publish"
    : verifyState === "verified"
      ? "Publish verified listing"
      : verifyState === "approved"
        ? "Publish reviewed listing"
        : "Publish unverified";

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
          <form ref={formRef} onSubmit={onSubmit} onChange={onFormChange} noValidate>
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

            <div className={styles.proof}>
              <div className={styles.proofHead}>
                <span className="overline">Proof of purchase</span>
                <span className={`badge ${proofBadge.tone}`}>{proofBadge.label}</span>
              </div>
              <label
                className={`${styles.upload}${dragover ? ` ${styles.dragover}` : ""}${file ? ` ${styles.hasFile}` : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragover(true);
                }}
                onDragLeave={() => setDragover(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
                <strong>{file ? file.name : "Drop your order confirmation here"}</strong>
                <span>
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB · ready for verification`
                    : "or click to browse · PNG, JPG, WEBP or PDF · max 8 MB"}
                </span>
              </label>
              <span className={styles.privacy}>
                Redact QR codes, barcodes, and personal data first. The file is sent to Gemini for
                one check and is not stored.
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onVerify}
                disabled={!file || ["checking", "verified", "approved", "unavailable"].includes(verifyState)}
              >
                {verifyLabel}
              </button>

              {result && verifyState !== "checking" && (
                <div className={styles.result}>
                  <strong className={styles.resultTitle}>
                    {verifyState === "verified" || verifyState === "approved"
                      ? verifyState === "approved"
                        ? "Ticket manually approved for demo"
                        : "Purchase evidence matched"
                      : verifyState === "review"
                        ? "Ticket detected — review needed"
                        : result.ticketDetected
                          ? "Ticket detected — verification rejected"
                          : "Not recognized as a ticket"}
                  </strong>
                  <span className={styles.resultMeta}>
                    {result.model ?? "Gemini"} · {Math.round(result.confidence * 100)}% confidence
                  </span>
                  <div className={styles.matchGrid}>
                    {(
                      [
                        ["eventName", "Event"],
                        ["eventDate", "Date"],
                        ["venue", "Venue"],
                      ] as const
                    ).map(([fieldName, label]) => {
                      const match = result.fieldMatches.find((m) => m.field === fieldName);
                      return (
                        <span key={fieldName}>
                          <small>{label}</small>
                          {match?.matched ? "Matched" : (match?.reason ?? "Mismatch")}
                        </span>
                      );
                    })}
                  </div>
                  {(result.rejectionReason || result.reviewReasons.length > 0) && (
                    <span className={styles.resultReason}>
                      {result.rejectionReason ?? result.reviewReasons.join("; ")}
                    </span>
                  )}
                  {verifyState === "review" && (
                    <button
                      type="button"
                      className={styles.approve}
                      onClick={() => {
                        setVerifyState("approved");
                        showToast("Manual demo approval recorded. This does not prove authenticity.");
                      }}
                    >
                      Approve for this demo only
                    </button>
                  )}
                </div>
              )}
              {verifyNote && <span className={styles.note}>{verifyNote}</span>}
            </div>

            <button className="btn btn-primary" type="submit" disabled={!canPublish}>
              {publishLabel}
            </button>
            <span className={styles.hint}>
              Verified listings go live with a badge everyone can see, including agents reading GET
              /api/listings. Agents list through the <Link href="/api">JSON API</Link>.
            </span>
          </form>
        </aside>
      </main>
      <div className={`${styles.toast}${toast ? ` ${styles.show}` : ""}`}>{toast}</div>
    </>
  );
}
