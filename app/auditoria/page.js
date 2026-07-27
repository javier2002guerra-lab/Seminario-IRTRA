import Shell from "@/components/Shell";
import { query } from "@/lib/db";
import { currentUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  if (!can(user, "admin"))
    redirect("/");
  const rows = await query(
    "SELECT a.*,u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200",
  );
  return (
    <Shell active="/auditoria">
      <div className="eyebrow">Trazabilidad</div>
      <h1 className="title">Registro de auditoría</h1>
      <p className="subtitle">
        Bitácora inmutable de accesos, análisis, cambios y exportaciones.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString("es-GT")}</td>
                <td>{r.user_name || "Sistema"}</td>
                <td>
                  <b>{r.action}</b>
                </td>
                <td>
                  {r.entity_type} #{r.entity_id}
                </td>
                <td>{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
