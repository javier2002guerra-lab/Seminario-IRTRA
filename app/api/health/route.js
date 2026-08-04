import { NextResponse } from "next/server";
import { get } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const started = Date.now();
  try {
    const db = await get("SELECT CURRENT_TIMESTAMP now");
    return NextResponse.json(
      {
        status: "healthy",
        database: "connected",
        checkedAt: db.now,
        latencyMs: Date.now() - started,
        version:
          process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
          process.env.npm_package_version ||
          "unknown",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "unavailable",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
