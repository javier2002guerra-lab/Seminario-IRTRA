import Shell from "@/components/Shell";
import { currentUser, can } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import UserForm from "./user-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  if (!can(user, "admin")) redirect("/");
  const users = await query(
    "SELECT u.id,u.name,u.email,u.role,u.active,string_agg(a.name,', ' ORDER BY a.name) areas FROM users u LEFT JOIN user_areas ua ON ua.user_id=u.id LEFT JOIN areas a ON a.id=ua.area_id GROUP BY u.id ORDER BY u.name",
  );
  const areas = await query("SELECT id,name FROM areas WHERE active=1 ORDER BY name");
  return (
    <Shell active="/usuarios">
      <div className="eyebrow">Seguridad y acceso</div>
      <h1 className="title">Usuarios</h1>
      <p className="subtitle">
        Administra las personas que pueden ingresar al sistema.
      </p>
      <div className="grid two">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Áreas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((x) => (
                <tr key={x.id}>
                  <td>
                    <b>{x.name}</b>
                    <br />
                    <small>{x.email}</small>
                  </td>
                  <td>{x.role === "admin" ? "Administrador" : "Verificador"}</td>
                  <td>{x.areas || "—"}</td>
                  <td>
                    <span className="badge">
                      {x.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <UserForm areas={areas} />
      </div>
    </Shell>
  );
}
