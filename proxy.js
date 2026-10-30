import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import crypto from "node:crypto";

const publicExact = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/mfa/setup",
  "/api/auth/mfa/verify",
  "/api/scanner/ingest",
  "/api/health",
  "/favicon.ico",
]);
const publicPrefixes = ["/_next/", "/images/"];
const ISSUER = "irtra-encuestas";
const AUDIENCE = "irtra-web";

export async function proxy(req) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const developmentEval =
    process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  const scannerRequest = req.nextUrl.pathname === "/api/scanner/ingest";
  if (req.nextUrl.pathname === "/_next/image")
    return NextResponse.json(
      { error: "Servicio no habilitado." },
      { status: 404 },
    );
  const contentLengthHeader = req.headers.get("content-length");
  const contentLength = Number(contentLengthHeader || 0);
  const uploadRequest =
    scannerRequest || req.nextUrl.pathname === "/api/surveys";
  const maxBody = uploadRequest
    ? 55 * 1024 * 1024
    : req.nextUrl.pathname === "/api/support"
      ? 256 * 1024
      : 64 * 1024;
  const expectsBody =
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    ![
      "/api/auth/logout",
      "/api/auth/mfa/setup",
      "/api/notifications",
    ].includes(req.nextUrl.pathname);
  if (
    expectsBody &&
    (!contentLengthHeader || req.headers.has("transfer-encoding"))
  )
    return NextResponse.json(
      { error: "Longitud de solicitud obligatoria." },
      { status: 411 },
    );
  if (contentLength > maxBody)
    return NextResponse.json(
      { error: "Solicitud demasiado grande." },
      { status: 413 },
    );
  if (!scannerRequest && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    try {
      const allowedOrigins = new Set(
        process.env.NODE_ENV === "production"
          ? String(process.env.ALLOWED_ORIGINS || process.env.APP_BASE_URL)
              .split(",")
              .map((value) => new URL(value.trim()).origin)
          : [req.nextUrl.origin, process.env.APP_BASE_URL]
              .filter(Boolean)
              .map((value) => new URL(value).origin),
      );
      if (!origin || !allowedOrigins.has(new URL(origin).origin))
        return NextResponse.json(
          { error: "Origen no válido." },
          { status: 403 },
        );
    } catch {
      return NextResponse.json({ error: "Origen no válido." }, { status: 403 });
    }
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Content-Security-Policy", csp);
  if (
    publicExact.has(req.nextUrl.pathname) ||
    publicPrefixes.some((path) => req.nextUrl.pathname.startsWith(path))
  )
    return response;
  const token = req.cookies.get(
    process.env.NODE_ENV === "production"
      ? "__Host-irtra_session"
      : "irtra_session",
  )?.value;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(
        process.env.SESSION_SECRET ||
          "solo-desarrollo-cambiar-secreto-de-64-caracteres-antes-de-produccion",
      ),
      { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE },
    );
    if (payload.password_change_required) {
      const allowedForPasswordChange = new Set([
        "/seguridad",
        "/api/auth/password",
        "/api/auth/logout",
        "/api/auth/session",
      ]);
      if (!allowedForPasswordChange.has(req.nextUrl.pathname)) {
        if (req.nextUrl.pathname.startsWith("/api/"))
          return NextResponse.json(
            { error: "Debe cambiar la contraseña inicial." },
            { status: 403 },
          );
        return NextResponse.redirect(new URL("/seguridad?required=password", req.url));
      }
    }
    return response;
  } catch {
    if (req.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
