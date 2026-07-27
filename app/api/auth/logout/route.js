import { NextResponse } from "next/server";
import { currentUser, clearSession } from "@/lib/auth";
import { audit } from "@/lib/db";
export async function POST(req) {
  const user = await currentUser();
  if (user)
    await audit({
      userId: user.id,
      action: "LOGOUT",
      ip: req.headers.get("x-forwarded-for"),
    });
  await clearSession();
  return NextResponse.json({ ok: true });
}
