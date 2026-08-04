import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { reportRange, reportStatistics } from "@/lib/reports";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const range = reportRange(Object.fromEntries(new URL(req.url).searchParams));
  const data = await reportStatistics(range);
  const token = crypto.randomUUID();
  const input = path.join(os.tmpdir(), `irtra-report-${token}.json`);
  const output = path.join(os.tmpdir(), `irtra-report-${token}.xlsx`);
  try {
    fs.writeFileSync(input, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
    const python =
      process.env.PYTHON_COMMAND ||
      (process.platform === "win32" ? "python" : "python3");
    const result = spawnSync(/*turbopackIgnore: true*/
      python,
      [path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "export-statistical-report.py"), input, output],
      {
        encoding: "utf8",
        timeout: 120000,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONPATH: [
            path.join(/*turbopackIgnore: true*/ process.cwd(), ".python-packages"),
            process.env.PYTHONPATH || "",
          ]
            .filter(Boolean)
            .join(path.delimiter),
        },
      },
    );
    if (result.status !== 0 || !fs.existsSync(/*turbopackIgnore: true*/ output))
      throw new Error("No se pudo generar el reporte estadístico.");
    const file = fs.readFileSync(/*turbopackIgnore: true*/ output);
    return new NextResponse(file, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="REPORTE ESTADISTICO ${range.from} a ${range.to}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error al generar reporte estadístico:", String(error.message).slice(0, 300));
    return NextResponse.json(
      { error: "No se pudo generar el reporte estadístico." },
      { status: 500 },
    );
  } finally {
    for (const file of [input, output]) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
  }
}
