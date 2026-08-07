"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { addListing, validateListing, formatEventDate, type Listing } from "@/lib/store";
import {
  MAX_DOCUMENT_BYTES,
  verifyDocument,
  type VerificationResult,
} from "@/lib/verification";
import { ListingCard } from "@/components/listing-card";
import { CheckIcon } from "@/components/icons";
import styles from "./sell.module.css";

const FIELDS = [
  { name: "event", label: "Event name", type: "text", placeholder: "Silverline Tour", error: "Event name is required." },
  { name: "date", label: "Event date", type: "date", placeholder: undefined, error: "A valid date is required." },
  { name: "venue", label: "Venue", type: "text", placeholder: "The Anthem, Washington DC", error: "Venue is required." },
  { name: "price", label: "Price (USDC)", type: "number", placeholder: "145", error: "Price must be a number greater than 0." },
] as const;

type FieldName = (typeof FIELDS)[number]["name"];
type FormValues = Record<FieldName, string>;

const EMPTY_VALUES: FormValues = { event: "", date: "", venue: "", price: "" };

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

const STEPS = [
  { n: 1, label: "Details" },
  { n: 2, label: "Verify proof" },
  { n: 3, label: "Live" },
] as const;

export function SellClient() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [published, setPublished] = useState<Listing | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  // Editing listing details invalidates a completed verification — the
  // document was checked against the old values.
  function setField(name: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (["verified", "review", "approved", "rejected"].includes(verifyState)) {
      setVerifyState(file ? "ready" : "idle");
      setResult(null);
      setVerifyNote("Details changed — verify the document again before publishing.");
    }
  }

  function continueToVerify() {
    const errors = validateListing(values);
    if (errors.length) {
      setInvalid(new Set(errors.map((err) => err.field)));
      return;
    }
    setInvalid(new Set());
    setStep(2);
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

  async function onVerify() {
    if (!file || verifyState === "checking") return;
    setVerifyState("checking");
    setVerifyNote(null);
    const outcome = await verifyDocument(file, {
      eventName: values.event,
      eventDate: values.date,
      venue: values.venue,
      priceUsdc: Number(values.price) || undefined,
    });

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

  function publish() {
    if (!canPublish) return;
    const res = addListing(values, "human", undefined, verifyState === "verified");
    if (!res.ok) {
      setInvalid(new Set(res.errors.map((err) => err.field)));
      setStep(1);
      return;
    }
    setPublished(res.listing);
    setStep(3);
  }

  function reset() {
    setStep(1);
    setValues(EMPTY_VALUES);
    setInvalid(new Set());
    setPublished(null);
    setFile(null);
    setResult(null);
    setVerifyNote(null);
    setVerifyState("idle");
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
              <div>
                <span className="badge badge-yellow">Human front door</span>
              </div>
              <h1 className="h2">List a ticket</h1>
              <div className={styles.fields}>
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
                      value={values[field.name]}
                      onChange={(e) => setField(field.name, e.target.value)}
                    />
                    <span className="error">{field.error}</span>
                  </div>
                ))}
              </div>
              <div>
                <button className="btn btn-primary" type="button" onClick={continueToVerify}>
                  Continue to verification
                </button>
              </div>
              <span className={styles.hint}>
                Agents list through the <Link href="/api">JSON API</Link> instead.
              </span>
            </div>
          )}

          {step === 2 && (
            <div className={styles.pane}>
              <h1 className="h2">Verify proof of purchase</h1>
              <div className={styles.notice}>
                The document check is real — Gemini reads your upload server-side and compares it
                with the listing. Nothing is stored, and payments stay a demo.
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

              <div className={styles.actions}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={onVerify}
                  disabled={!file || ["checking", "verified", "approved", "unavailable"].includes(verifyState)}
                >
                  {verifyLabel}
                </button>
                <button className="btn btn-primary" type="button" onClick={publish} disabled={!canPublish}>
                  {publishLabel}
                </button>
              </div>
              <button className={styles.back} type="button" onClick={() => setStep(1)}>
                ← Edit listing details
              </button>
            </div>
          )}

          {step === 3 && published && (
            <div className={`${styles.pane} ${styles.paneDone}`}>
              <div className={styles.doneIcon}>
                <CheckIcon className="" />
              </div>
              <h1 className="h2">Your ticket is live</h1>
              <p className="sub" style={{ maxWidth: 440 }}>
                {published.verified
                  ? "The proof of purchase matched, so the listing carries a verified badge everyone can see — humans and agents alike."
                  : "The listing is live without a verified badge. Buyers and agents see it in the same live inventory."}
              </p>
              <div className={styles.doneCard}>
                <ListingCard listing={published} showBuy={false} />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <Link className="btn btn-primary" href="/listings">
                  View live listings
                </Link>
                <button className="btn btn-secondary" type="button" onClick={reset}>
                  List another ticket
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className={`card ${styles.summary}`}>
          <span className="overline">Listing summary</span>
          <div className={styles.row}>
            <span>Event</span>
            <span>{values.event || "–"}</span>
          </div>
          <div className={styles.row}>
            <span>Date</span>
            <span>{/^\d{4}-\d{2}-\d{2}$/.test(values.date) ? formatEventDate(values.date) : "–"}</span>
          </div>
          <div className={styles.row}>
            <span>Venue</span>
            <span>{values.venue || "–"}</span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span>Price</span>
            <span>{values.price ? `${values.price} USDC` : "–"}</span>
          </div>
          <div className={styles.row}>
            <span>Proof of purchase</span>
            <span className={`badge ${proofBadge.tone}`}>{proofBadge.label}</span>
          </div>
          <ul className={styles.timeline}>
            <li>
              <i>1</i>Enter the ticket details
            </li>
            <li>
              <i>2</i>Gemini checks your proof of purchase
            </li>
            <li>
              <i>3</i>The listing goes live for humans and agents
            </li>
          </ul>
        </aside>
      </main>
      <div className={`${styles.toast}${toast ? ` ${styles.show}` : ""}`}>{toast}</div>
    </>
  );
}
