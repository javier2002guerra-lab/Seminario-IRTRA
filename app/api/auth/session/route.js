import { NextResponse } from "next/server";
import { clearSession, currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    await clearSession();
    return NextResponse.json(
      { error: "Esta sesión fue cerrada porque el usuario inició sesión en otro dispositivo." },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
