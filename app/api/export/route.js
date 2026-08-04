import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { query, audit } from "@/lib/db";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { parseExportRange } from "@/lib/report-range";
import { clientIp } from "@/lib/security";
import { verifyManagerialTemplate } from "@/lib/excel-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await currentUser();
  if (!can(user,"verificador")) return NextResponse.json({error:"Sin permiso"},{status:403});
  let range;
  try { range = parseExportRange(new URL(req.url).searchParams); }
  catch (error) { return NextResponse.json({error:error.message},{status:400}); }
  const surveys = await query(`SELECT s.*,COALESCE(string_agg(DISTINCT a.name,'|'),'') areas FROM surveys s LEFT JOIN survey_areas sa ON sa.survey_id=s.id LEFT JOIN areas a ON a.id=sa.area_id WHERE s.status<>'Error' AND s.validation_status='Confirmada' AND s.created_at>=?::date AND s.created_at<?::date + INTERVAL '1 day' GROUP BY s.id ORDER BY s.created_at`,range.from,range.to);
  const ratings = await query("SELECT sr.survey_id,sr.service_name,sr.rating,sr.score,sr.negative FROM service_ratings sr JOIN surveys s ON s.id=sr.survey_id WHERE s.validation_status='Confirmada' AND s.created_at>=?::date AND s.created_at<?::date + INTERVAL '1 day' ORDER BY sr.id",range.from,range.to);
  const bySurvey = new Map();
  for (const rating of ratings) {
    if (!bySurvey.has(String(rating.survey_id))) bySurvey.set(String(rating.survey_id),[]);
    bySurvey.get(String(rating.survey_id)).push(rating);
  }
  const payload = surveys.map(row => {
    let extracted = {};
    try { extracted = JSON.parse(row.extracted_data || "{}"); } catch {}
    return {
      id: row.id, created_at: row.created_at, category: row.category,
      priority: row.priority, primary_topic: row.primary_topic, summary: row.summary,
      origin_place: row.origin_place, restaurant: row.restaurant, hotel: row.hotel,
      general: extracted.general_data || {}, numbered: extracted.numbered_answers || {},
      areas: row.areas ? row.areas.split("|") : [], ratings: bySurvey.get(String(row.id)) || [],
    };
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
