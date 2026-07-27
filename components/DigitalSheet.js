const services = [
  "Cortesía del personal",
  "Prontitud en chequeo de ingreso y salida",
  "Limpieza de habitaciones",
  "Limpieza de sanitarios",
  "Mantenimiento de instalaciones",
  "Jardines",
  "Servicio de maleteros",
  "Calidad de comida",
  "Prontitud en revisión de inventarios",
  "Servicio Club Los Corozos",
  "Servicio en tiendas de conveniencia",
  "Servicio en personal de eventos",
  "Servicio en Restaurante",
  "Personal de seguridad",
];
const value = (data, n, ...keys) =>
  keys
    .map((k) => data?.[k] ?? n?.[k])
    .find((v) => v !== undefined && v !== null && v !== "") || "Sin dato";
export default function DigitalSheet({ record, ratings = [] }) {
  let extracted = {};
  try {
    extracted = JSON.parse(record.extracted_data || "{}");
  } catch {}
  const g = extracted.general_data || {},
    n = extracted.numbered_answers || {},
    ratingMap = new Map(
      ratings.map((r) => [r.service_name || r.service, r.rating]),
    );
  return (
    <article className="digital-sheet">
      <div className="sheet-band" />
      <div className="sheet-toolbar">
        <span className="badge">{record.status}</span>
        <span>{record.original_name}</span>
      </div>
      <header className="sheet-header">
        <div className="sheet-marker">IRTRA</div>
        <div>
          <h2>Estimado visitante</h2>
          <p>
            Agradecemos sus comentarios y sugerencias, los cuales servirán para
            evaluar los estándares de servicio que le brindamos durante su
            visita.
          </p>
        </div>
        <div className="sheet-number">
          <span>No.</span>
          <b>{value(g, n, "document_number", "item_0") || record.id}</b>
        </div>
      </header>
      <section className="sheet-fields">
        <Line
          no="1"
          label="Nombre"
          answer={value(g, n, "visitor_name", "name", "item_1")}
        />
        <Line
          no="2"
          label="Afiliado"
          answer={value(g, n, "affiliate_status", "affiliate", "item_2")}
        />
        <div className="sheet-split">
          <Line
            no="3"
            label="Fecha"
            answer={value(g, n, "visit_date", "date", "item_3")}
          />
          <Line label="Teléfono" answer={value(g, n, "phone")} />
        </div>
        <Line
          no="4"
          label="Correo electrónico"
          answer={value(g, n, "email", "item_4")}
        />
        <Line
          no="5"
          label="Razón de su visita"
          answer={value(g, n, "visit_reason", "item_5")}
        />
        <div className="sheet-split">
          <Line label="Restaurante" answer={record.restaurant || g.restaurant || "Sin especificar"} />
          <Line label="Hotel" answer={record.hotel || g.hotel || "Sin especificar"} />
        </div>
      </section>
      <div className="sheet-section-title">
        6. Califique marcando con una X los siguientes servicios según su nivel
        de calidad
      </div>
      <div className="sheet-table-wrap">
        <table className="sheet-matrix">
          <thead>
            <tr>
              <th>Servicios</th>
              {["Excelente", "Bueno", "Regular", "Malo"].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((name) => {
              const rating = ratingMap.get(name) || "Sin dato";
              return (
                <tr key={name}>
                  <td>{name}</td>
                  {["Excelente", "Bueno", "Regular", "Malo"].map((x) => (
                    <td className="matrix-cell" key={x}>
                      {rating.toLowerCase() === x.toLowerCase() ? "X" : ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="sheet-fields questions">
        {[
          ["7", "¿Recomienda visitar Los Hostales?", "item_7"],
          ["8", "¿Tuvo alguna dificultad durante su visita?", "item_8"],
          ["9", "¿Cuál fue?", "item_9"],
          ["10", "¿Le resolvieron el inconveniente a tiempo?", "item_10"],
          ["11", "¿Algún colaborador le causó inconvenientes?", "item_11"],
          ["12", "¿Quién le atendió?", "item_12"],
          ["13", "Nombre del colaborador que le atendió", "item_13"],
          ["14", "¿Qué podemos hacer para mejorar su visita?", "item_14"],
        ].map(([no, label, key]) => (
          <Line key={no} no={no} label={label} answer={value(g, n, key)} />
        ))}
      </section>
      <footer className="sheet-footer">
        <span>
          <b>Clasificación:</b> {record.category}
        </span>
        <span>
          <b>Prioridad:</b> {record.priority}
        </span>
        <span>
          <b>Confianza:</b> {Math.round(record.confidence * 100)}%
        </span>
      </footer>
    </article>
  );
}
function Line({ no, label, answer }) {
  return (
    <div className="sheet-line">
      {no && <b>{no}.</b>}
      <span>{label}</span>
      <i>{answer}</i>
    </div>
  );
}
