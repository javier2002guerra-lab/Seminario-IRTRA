import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const publicExact = new Set(["/login", "/api/auth/login", "/api/scanner/ingest", "/favicon.ico"]);
const publicPrefixes = ["/_next/", "/images/"];
const ISSUER = "irtra-encuestas";
const AUDIENCE = "irtra-web";

export async function proxy(req) {
  const scannerRequest = req.nextUrl.pathname === "/api/scanner/ingest";
  if (req.nextUrl.pathname === "/_next/image")
    return NextResponse.json({ error: "Servicio no habilitado." }, { status: 404 });
  const contentLength = Number(req.headers.get("content-length") || 0);
  const maxBody = req.nextUrl.pathname === "/api/auth/login" ? 16 * 1024 : 55 * 1024 * 1024;
  if (contentLength > maxBody)
    return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  if (!scannerRequest && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    try {
      if (!origin || new URL(origin).host !== req.headers.get("host"))
        return NextResponse.json({ error: "Origen no válido." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Origen no válido." }, { status: 403 });
    }
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  if (publicExact.has(req.nextUrl.pathname) || publicPrefixes.some((path) => req.nextUrl.pathname.startsWith(path))) return response;
  const token = req.cookies.get("irtra_session")?.value;
  try {
    await jwtVerify(
      token,
      new TextEncoder().encode(process.env.SESSION_SECRET || "solo-desarrollo-cambiar-secreto-de-64-caracteres-antes-de-produccion"),
      { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE },
    );
    return response;
  } catch {
    if (req.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
