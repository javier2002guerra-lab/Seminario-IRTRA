import { NextResponse } from "next/server";
import { currentUser, clearSession } from "@/lib/auth";
import { audit } from "@/lib/db";
import { clientIp } from "@/lib/security";
export async function POST(req) {
  const user = await currentUser();
  if (user)
    await audit({
      userId: user.id,
      action: "LOGOUT",
      ip: clientIp(req),
    });
  await clearSession();
  return NextResponse.json({ ok: true });
}
