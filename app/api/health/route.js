import { NextResponse } from "next/server";
import { get } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const started = Date.now();
  try {
    await get("SELECT CURRENT_TIMESTAMP now");
    return NextResponse.json(
      {
        status: "healthy",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
