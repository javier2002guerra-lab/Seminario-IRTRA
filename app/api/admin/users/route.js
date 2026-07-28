import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { run, audit, transaction } from "@/lib/db";
const roles = ["admin", "verificador"];
export async function POST(req) {
  const user = await currentUser();
  if (!can(user, "admin"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const b = await req.json();
  if (
    !b.name ||
    !/^\S+@\S+\.\S+$/.test(b.email) ||
    !roles.includes(b.role) ||
    String(b.password).length < 14 ||
    String(b.password).length > 128 ||
    !/[a-z]/.test(String(b.password)) ||
    !/[A-Z]/.test(String(b.password)) ||
    !/\d/.test(String(b.password)) ||
    !/[^A-Za-z0-9]/.test(String(b.password))
  )
    return NextResponse.json(
      {
        error:
          "Datos inválidos; la contraseña debe tener entre 14 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo.",
      },
      { status: 400 },
    );
  try {
    const id = await transaction(async () => {
      const x = await run(
        "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1) RETURNING id",
        b.name.slice(0, 120),
        b.email.toLowerCase().slice(0, 160),
        bcrypt.hashSync(b.password, 12),
        b.role,
      );
      const id = Number(x.lastInsertRowid);
      for (const area of b.areas || [])
        await run(
          "INSERT INTO user_areas(user_id,area_id) VALUES(?,?) ON CONFLICT DO NOTHING",
          id,
          Number(area),
        );
      await audit({
        userId: user.id,
        action: "USER_CREATE",
        entityType: "user",
        entityId: id,
        after: { name: b.name, email: b.email, role: b.role, areas: b.areas },
      });
      return id;
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "El correo ya existe." },
      { status: 409 },
    );
  }
}
