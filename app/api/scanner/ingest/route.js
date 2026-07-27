import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ingestSurvey } from "@/lib/ingest";

export const runtime = "nodejs";

function authorized(req) {
  const configured = Buffer.from(process.env.SCANNER_INGEST_TOKEN || "");
  const supplied = Buffer.from((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  return configured.length >= 43 && configured.length === supplied.length && crypto.timingSafeEqual(configured, supplied);
}

export async function POST(req) {
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
      ip: req.headers.get("x-forwarded-for"),
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
