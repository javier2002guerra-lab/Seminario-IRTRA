import OpenAI from "openai";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { executiveData } from "@/lib/executive";
import { consumeRateLimit, query } from "@/lib/db";
import { surveyScope } from "@/lib/scope";
import { screenName } from "@/lib/atlas-knowledge";
import { responseSchema, systemInstructions } from "@/lib/atlas-prompt";
export const runtime = "nodejs";

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item) =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string",
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 4000),
    }))
    .filter((item) => item.content)
    .slice(-40);
}

// Áreas en las que el usuario puede crear planes (las mismas que valida /api/actions).
async function allowedAreas(user) {
  return user.role === "admin"
    ? query("SELECT id,name FROM areas WHERE active=1 ORDER BY name")
    : query(
        "SELECT a.id,a.name FROM areas a JOIN user_areas ua ON ua.area_id=a.id WHERE ua.user_id=? AND a.active=1 ORDER BY a.name",
        user.id,
      );
}

export async function POST(request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Tu sesión ha vencido." },
      { status: 401 },
    );
  if (
    process.env.EXTERNAL_SUPPORT_AI_ENABLED !== "true" ||
    !process.env.OPENAI_API_KEY
  )
    return NextResponse.json(
      { error: "ATLAS no está configurado." },
      { status: 503 },
    );
  if (await consumeRateLimit(`atlas:${user.id}`, 30, 60))
    return NextResponse.json(
      { error: "Demasiadas solicitudes seguidas. Espera un minuto." },
      { status: 429 },
    );
  let messages, screen;
  try {
    const body = await request.json();
    messages = cleanMessages(body.messages);
    screen = screenName(body.page);
  } catch {
    return NextResponse.json(
      { error: "La consulta no es válida." },
      { status: 400 },
    );
  }
  if (!messages.length || messages.at(-1)?.role !== "user")
    return NextResponse.json(
      { error: "Escribe una pregunta para recibir ayuda." },
      { status: 400 },
    );
  const to = new Date().toISOString().slice(0, 10),
    from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    [data, areas] = await Promise.all([
      executiveData({ from, to, scope: surveyScope(user, "s") }),
      allowedAreas(user),
    ]),
    areaNames = areas.map((a) => a.name),
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
      maxRetries: 2,
    });
  try {
    const response = await client.responses.create({
      model:
        process.env.OPENAI_SUPPORT_MODEL ||
        process.env.OPENAI_MODEL ||
        "gpt-5.4-mini",
      store: false,
      instructions: systemInstructions(user, data, { screen, areas: areaNames }),
      input: messages,
      max_output_tokens: 4000,
      text: {
        format: {
          type: "json_schema",
          name: "atlas_support",
          strict: true,
          schema: responseSchema(areaNames),
        },
      },
    });
    const parsed = JSON.parse(response.output_text || "{}");
    const answer = String(parsed.answer || "").trim();
    if (!answer) throw new Error("Respuesta vacía");
    const plan = parsed.action_plan || null,
      area = plan && areas.find((a) => a.name === plan.area);
    return NextResponse.json({
      answer,
      actionPlan: area ? { ...plan, area_id: Number(area.id) } : null,
      period: { from, to },
    });
  } catch (error) {
    console.error("ATLAS error:", error?.status || error?.name || "Error");
    return NextResponse.json(
      { error: "ATLAS no está disponible temporalmente." },
      { status: 502 },
    );
  }
}
