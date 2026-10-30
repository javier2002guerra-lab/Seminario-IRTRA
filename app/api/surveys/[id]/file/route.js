import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { get, audit } from "@/lib/db";
import { surveyScope } from "@/lib/scope";
import { clientIp, isValidId } from "@/lib/security";
import { uploadDirectory } from "@/lib/files";
export async function GET(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params, scope = surveyScope(user, "s");
  if (!isValidId(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const r = await get(`SELECT s.* FROM surveys s WHERE s.id=? AND ${scope.where}`, Number(id), ...scope.params);
  if (!r) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (r.stored_name.startsWith("PURGED-")) return NextResponse.json({ error: "El original fue eliminado por la política de retención." }, { status: 410 });
  const safe = path.basename(r.stored_name);
  const storedFile = await get("SELECT content FROM survey_files WHERE survey_id=?", r.id);
  const diskPath = path.join(/* turbopackIgnore: true */ uploadDirectory(), safe);
  const file = storedFile?.content || (fs.existsSync(diskPath) ? fs.readFileSync(diskPath) : null);
  if (!file)
    return NextResponse.json(
      { error: "El archivo original no está disponible. Vuelva a escanearlo para restaurarlo." },
      { status: 404 },
    );
  await audit({ userId: user.id, action: "ORIGINAL_DOWNLOAD", entityType: "survey", entityId: r.id, ip: clientIp(req) });
  return new NextResponse(file, { headers: { "content-type": r.mime_type, "content-disposition": `${new URL(req.url).searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(r.original_name)}`, "cache-control": "no-store", "content-security-policy": "sandbox; default-src 'none'", "x-content-type-options": "nosniff" } });
}
