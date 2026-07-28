import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ingestSurvey } from "@/lib/ingest";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
const attempts = new Map();

function rateLimited(req) {
  const key = clientIp(req);
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, start: now };
  if (now - entry.start > 60000) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  attempts.set(key, entry);
  if (attempts.size > 5000) {
    for (const [candidate, value] of attempts) {
      if (now - value.start > 60000) attempts.delete(candidate);
      if (attempts.size <= 4000) break;
    }
    while (attempts.size > 4000)
      attempts.delete(attempts.keys().next().value);
  }
  return entry.count > 20;
}

function authorized(req) {
  const configured = Buffer.from(process.env.SCANNER_INGEST_TOKEN || "");
  const supplied = Buffer.from((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  return configured.length >= 43 && configured.length === supplied.length && crypto.timingSafeEqual(configured, supplied);
}

export async function POST(req) {
  if (rateLimited(req))
    return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
  if (!authorized(req)) return NextResponse.json({ error: "Conector no autorizado." }, { status: 401 });
  const file = (await req.formData()).get("file");
  if (!file || typeof file.arrayBuffer !== "function")
    return NextResponse.json({ error: "No se recibió un documento." }, { status: 400 });
  try {
    const result = await ingestSurvey({
      name: file.name,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      source: "scanner-remoto",
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  } catch (error) {
    const duplicate = /duplicado/i.test(String(error.message));
    return NextResponse.json(
      { ok: duplicate, duplicate, error: String(error.message).slice(0, 300) },
      { status: duplicate ? 200 : 400 },
    );
  }
}
