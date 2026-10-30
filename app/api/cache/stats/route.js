// Observabilidad de los dos aportes: métricas de la caché (hits, misses, tasa
// de acierto, desalojos) y del canal en tiempo real (clientes conectados).
// Solo para administradores; sirve como evidencia verificable en la demo.

import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { cacheStats } from "@/lib/cache";
import { liveStats } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!can(user, "admin"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  return NextResponse.json({
    cache: cacheStats(),
    realtime: liveStats(),
    at: new Date().toISOString(),
  });
}
