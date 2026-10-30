import { NextResponse } from "next/server";
import { currentUser, clearSession } from "@/lib/auth";
import { audit, run, transaction } from "@/lib/db";
import { clientIp } from "@/lib/security";
export async function POST(req) {
  const user = await currentUser();
  if (user) {
    await transaction(async () => {
      await run(
        "UPDATE users SET session_version=session_version+1 WHERE id=?",
        user.id,
      );
      await audit({
        userId: user.id,
        action: "LOGOUT",
        ip: clientIp(req),
        after: { session_invalidated: true },
      });
    });
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
