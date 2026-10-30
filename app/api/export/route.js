import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { audit } from "@/lib/db";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { parseExportRange } from "@/lib/report-range";
import { clientIp } from "@/lib/security";
import { verifyManagerialTemplate } from "@/lib/excel-template";
import { surveyScope } from "@/lib/scope";
import { managerialExportRows } from "@/lib/managerial-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await currentUser();
  if (!can(user,"verificador")) return NextResponse.json({error:"Sin permiso"},{status:403});
  let range;
  try { range = parseExportRange(new URL(req.url).searchParams); }
  catch (error) { return NextResponse.json({error:error.message},{status:400}); }
  const payload = await managerialExportRows({
    scope: surveyScope(user, "s"),
    range,
  });
  const template = path.join(/*turbopackIgnore: true*/ process.cwd(),"data","excel_templates","INFORME GERENCIAL ENCUESTAS.xlsm");
  if (!fs.existsSync(/*turbopackIgnore: true*/ template)) return NextResponse.json({error:"No se encontró la plantilla gerencial XLSM."},{status:500});
  try {
    verifyManagerialTemplate(template);
  } catch {
    return NextResponse.json({error:"La plantilla gerencial no supera la verificación de integridad."},{status:500});
  }
  const token = crypto.randomUUID(), input = path.join(os.tmpdir(),`irtra-${token}.json`), output = path.join(os.tmpdir(),`irtra-${token}.xlsm`);
  try {
    fs.writeFileSync(input,JSON.stringify(payload),{encoding:"utf8",mode:0o600});
    const python = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
    const pythonPackages = path.join(/*turbopackIgnore: true*/ process.cwd(), ".python-packages");
    const pythonPath = [pythonPackages, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    const result = spawnSync(/*turbopackIgnore: true*/ python,[path.join(/*turbopackIgnore: true*/ process.cwd(),"scripts","fill-managerial-template.py"),template,input,output],{
      encoding:"utf8",
      timeout:120000,
      windowsHide:true,
      env:{...process.env,PYTHONPATH:pythonPath},
    });
    if (result.status !== 0 || !fs.existsSync(/*turbopackIgnore: true*/ output)) {
      console.error("Error al generar XLSM:",String(result.stderr || result.stdout).slice(0,2000));
      return NextResponse.json({error:"No fue posible llenar la plantilla gerencial. Verifique Python y openpyxl."},{status:500});
    }
    const file = fs.readFileSync(/*turbopackIgnore: true*/ output);
    await audit({userId:user.id,action:"REPORT_EXPORT",entityType:"report",ip:clientIp(req),after:{records:payload.length,format:"xlsm",template:path.basename(template),from:range.from,to:range.to}});
    return new NextResponse(file,{headers:{"content-type":"application/vnd.ms-excel.sheet.macroEnabled.12","content-disposition":`attachment; filename="INFORME GERENCIAL ${range.from} a ${range.to}.xlsm"`,"cache-control":"no-store, no-cache, must-revalidate","pragma":"no-cache","expires":"0"}});
  } finally {
    for (const file of [input,output]) try { fs.unlinkSync(file); } catch {}
  }
}
