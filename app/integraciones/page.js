import Shell from "@/components/Shell";
import { query } from "@/lib/db";
import { configuredChannels } from "@/lib/enterprise-notifications";
import ScheduleForm, { ScheduleToggle } from "./schedule-form";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function IntegrationsPage() {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/");
  const [schedules, deliveries] = await Promise.all([
    query(
      "SELECT rs.*,u.name creator_name FROM report_schedules rs JOIN users u ON u.id=rs.created_by ORDER BY rs.id DESC",
    ),
    query("SELECT * FROM delivery_log ORDER BY id DESC LIMIT 50"),
  ]);
  const channels = configuredChannels();
  return (
    <Shell active="/integraciones">
      <div className="eyebrow">Automatización empresarial</div>
      <h1 className="title">Informes e integraciones</h1>
      <p className="subtitle">
        Programa reportes y alertas para responsables internos.
      </p>
      <div className="integration-status">
        <Status name="Correo SMTP" ready={channels.email} />
        <Status name="Microsoft Teams" ready={channels.teams} />
        <Status name="WhatsApp corporativo" ready={channels.whatsapp} />
      </div>
      <ScheduleForm channels={channels} />
      <div className="card table-scroll">
        <h3>Programaciones</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Frecuencia</th>
              <th>Canales</th>
              <th>Último envío</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((x) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td>
                  {x.cadence} · {x.hour_local}:00
                </td>
                <td>{JSON.parse(x.channels_json).join(", ")}</td>
                <td>
                  {x.last_sent_at
                    ? new Date(x.last_sent_at).toLocaleString("es-GT")
                    : "Sin ejecutar"}
                </td>
                <td>{x.active ? "Activa" : "Pausada"}</td>
                <td>
                  <ScheduleToggle schedule={x} />
                </td>
              </tr>
            ))}
            {!schedules.length && (
              <tr>
                <td colSpan="6">No hay informes programados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="card table-scroll">
        <h3>Historial de entregas internas</h3>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Canal</th>
              <th>Destino</th>
              <th>Estado</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((x) => (
              <tr key={x.id}>
                <td>{new Date(x.created_at).toLocaleString("es-GT")}</td>
                <td>{x.kind}</td>
                <td>{x.channel}</td>
                <td>{x.recipient}</td>
                <td>{x.status}</td>
                <td>{x.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
function Status({ name, ready }) {
  return (
    <div className={`card integration-chip ${ready ? "ready" : "pending"}`}>
      <span>{ready ? "✓" : "!"}</span>
      <div>
        <b>{name}</b>
        <small>{ready ? "Configurado" : "Pendiente de credenciales"}</small>
      </div>
    </div>
  );
}
