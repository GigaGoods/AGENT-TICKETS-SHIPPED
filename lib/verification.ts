// Client-side helper for POST /api/verify (the document verification
// endpoint backed by verification/service.js on the server). Mirrors the
// result shape documented in verification/types.js.

export type VerificationStatus = "pending" | "verified" | "rejected" | "needs_review";

export interface FieldMatch {
  field: string;
  matched: boolean;
  expected?: string;
  actual?: string | null;
  reason?: string;
}

export interface ExtractedTicketFields {
  eventName: string | null;
  eventDate: string | null;
  venue: string | null;
  platform: string | null;
  ticketCount: number | null;
  seatInfo: string | null;
}

export interface VerificationResult {
  id: string;
  status: VerificationStatus;
  documentType: string;
  extracted: ExtractedTicketFields;
  fieldMatches: FieldMatch[];
  confidence: number; // 0–1
  flags: string[];
  ticketDetected: boolean;
  reviewReasons: string[];
  rejectionReason?: string;
  verifiedAt: string;
  provider: string;
  model?: string;
  disclaimer?: string;
  activeWarnings?: string[];
}

export type VerifyOutcome =
  | { ok: true; verification: VerificationResult }
  | { ok: false; error: string; unavailable: boolean };

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

export function documentMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsDataURL(file);
  });
}

export interface ListingContext {
  eventName: string;
  eventDate: string;
  venue: string;
  priceUsdc?: number;
}

export async function verifyDocument(file: File, listing: ListingContext): Promise<VerifyOutcome> {
  try {
    const documentBase64 = await fileToBase64(file);
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentBase64, mimeType: documentMimeType(file), listing }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: String(payload.error ?? "Verification request failed"),
        unavailable: response.status === 503,
      };
    }
    return { ok: true, verification: payload.verification as VerificationResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification request failed";
    return { ok: false, error: message, unavailable: false };
  }
}
