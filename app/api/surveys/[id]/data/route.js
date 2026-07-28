import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit, transaction } from "@/lib/db";
const restaurants = ["", "La Hacienda", "Arekas", "Corozos", "Kapahapa"];
const hotels = ["", "San Martín", "Santa Cruz", "Ranchería", "Palajunoj"];
const originPlaces = ["", "Golfito", "Gimnasio", "Spa", "Boliche"];
const ratings = ["Excelente", "Bueno", "Regular", "Malo", "Sin dato"];
export async function PATCH(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador")) return NextResponse.json({ error: "Sin permiso para editar la extracción." }, { status: 403 });
  const { id } = await params, record = await get("SELECT * FROM surveys WHERE id=?", Number(id));
  if (!record) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
  const b = await req.json();
  if (!String(b.reason || "").trim() || !restaurants.includes(b.restaurant || "") || !hotels.includes(b.hotel || "") || !originPlaces.includes(b.origin_place || "")) return NextResponse.json({ error: "Indique un motivo y seleccione opciones válidas." }, { status: 400 });
  const numbered = {};
  for (let i = 1; i <= 14; i++) numbered[`item_${i}`] = String(b.numbered?.[`item_${i}`] || "").slice(0, 2000) || null;
  const general = { document_number: String(b.general?.document_number || "").slice(0, 120) || null, visitor_name: String(b.general?.visitor_name || "").slice(0, 200) || null, affiliate_status: String(b.general?.affiliate_status || "").slice(0, 80) || null, visit_date: String(b.general?.visit_date || "").slice(0, 80) || null, email: String(b.general?.email || "").slice(0, 200) || null, phone: String(b.general?.phone || "").slice(0, 80) || null, room_number: String(b.general?.room_number || "").slice(0, 80) || null, visit_reason: String(b.general?.visit_reason || "").slice(0, 500) || null, restaurant: b.restaurant || null, hotel: b.hotel || null, origin_place: b.origin_place || null };
  const extracted = { ...JSON.parse(record.extracted_data || "{}"), general_data: general, numbered_answers: numbered };
  await transaction(async () => {
    await run("UPDATE surveys SET extracted_data=?,restaurant=?,hotel=?,origin_place=?,validation_status='En revisión',needs_review=1,confirmed_by=NULL,confirmed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", JSON.stringify(extracted), b.restaurant || null, b.hotel || null, b.origin_place || null, record.id);
    await run("DELETE FROM service_ratings WHERE survey_id=?", record.id);
    for (const item of b.ratings || []) if (item.service && ratings.includes(item.rating)) await run("INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)", record.id, String(item.service).slice(0, 160), item.rating, item.rating === "Excelente" ? 5 : item.rating === "Bueno" ? 4 : item.rating === "Regular" ? 3 : item.rating === "Malo" ? 1 : null, item.rating === "Malo" ? 1 : 0);
    await run("INSERT INTO corrections(survey_id,user_id,field,original_value,previous_value,new_value,reason) VALUES(?,?,?,?,?,?,?)", record.id, user.id, "datos_extraidos", JSON.stringify(JSON.parse(record.ai_original || "{}").extracted_data || {}), record.extracted_data, JSON.stringify(extracted), String(b.reason).slice(0, 500));
    await audit({ userId: user.id, action: "EXTRACTED_DATA_EDIT", entityType: "survey", entityId: record.id, before: { origin_place: record.origin_place, restaurant: record.restaurant, hotel: record.hotel }, after: { restaurant: b.restaurant, hotel: b.hotel, origin_place: b.origin_place, reason: b.reason } });
  });
  return NextResponse.json({ ok: true });
}
