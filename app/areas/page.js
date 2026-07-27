import Shell from "@/components/Shell";
import { query } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import AreaForm from "./area-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  const rows = await query("SELECT * FROM areas ORDER BY active DESC,name");
  return (
    <Shell active="/areas">
      <div className="eyebrow">Configuración operativa</div>
      <h1 className="title">Áreas y responsables</h1>
      <p className="subtitle">
        Catálogo administrable utilizado por la clasificación automática.
      </p>
      <div className="grid two">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Área</th>
                <th>Responsable</th>
                <th>Contacto</th>
                <th>SLA</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                    <br />
                    <small>{r.description}</small>
                  </td>
                  <td>{r.owner || "Por asignar"}</td>
                  <td>{r.contact || "—"}</td>
                  <td>
                    <small>
                      {Object.entries(JSON.parse(r.sla_json))
                        .map(([k, v]) => `${k}: ${v}h`)
                        .join(" · ")}
                    </small>
                  </td>
                  <td>
                    <span className="badge">
                      {r.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {["admin","verificador"].includes(user.role) && <AreaForm />}
      </div>
    </Shell>
  );
}
