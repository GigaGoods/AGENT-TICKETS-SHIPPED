import { NextResponse } from "next/server";
// Plain ESM JavaScript with JSDoc types (tsconfig has allowJs). The module
// calls the configured vision provider, so this route must stay server-side.
import { VerificationService, VerificationError } from "@/verification/service";

export const runtime = "nodejs";

let service: VerificationService | undefined;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    service ??= new VerificationService();
    const verification = await service.verifyDocument(body as Parameters<VerificationService["verifyDocument"]>[0]);
    return NextResponse.json({ ok: true, verification });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    // No vision API key configured — the UI treats 503 as "verification
    // unavailable" and lets sellers publish unverified.
    const missingKey = message.includes("GOOGLE_API_KEY") || message.includes("OPENAI_API_KEY");
    const status = err instanceof VerificationError ? err.statusCode : missingKey ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
