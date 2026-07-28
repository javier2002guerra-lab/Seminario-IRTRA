"use client";
import { useEffect, useState } from "react";
import DataEditor from "./data-editor";

export default function ReviewWorkspace({ record, ratings, canEdit }) {
  const [view, setView] = useState("original");
  const [preview, setPreview] = useState({ state: "loading", url: "" });
  const url = `/api/surveys/${record.id}/file?preview=1`;
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetch(url, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "No fue posible abrir el documento.");
        }
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ state: "ready", url: objectUrl });
      })
      .catch((error) => {
        if (active) setPreview({ state: "error", message: error.message });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return <section style={{marginTop:18}}>
    <div className="eyebrow">Mesa de revisión</div>
    <h2>Original y campos extraídos</h2>
    <p className="subtitle">Compare la boleta sin salir del caso y corrija cualquier lectura dudosa.</p>
    <div className="view-tabs" role="tablist" aria-label="Vista de revisión">
      <button className={`btn ${view === "original" ? "" : "secondary"}`} type="button" onClick={()=>setView("original")}>Ver original</button>
      <button className={`btn ${view === "fields" ? "" : "secondary"}`} type="button" onClick={()=>setView("fields")}>Ver campos editables</button>
    </div>
    <div hidden={view !== "original"}>
      <div className="original-viewer">
      {preview.state === "loading" && <div className="viewer-message">Cargando documento original…</div>}
      {preview.state === "error" && <div className="viewer-message viewer-error"><b>No se pudo mostrar el documento.</b><span>{preview.message}</span></div>}
      {preview.state === "ready" && (record.mime_type === "application/pdf" ? <iframe src={preview.url} title="Boleta original" sandbox=""/> : <img src={preview.url} alt="Boleta original"/>)}
      </div>
    </div>
    <div hidden={view !== "fields"}>
      {canEdit ? <DataEditor record={record} ratings={ratings}/> : <div className="card"><p>No tiene permiso para modificar esta boleta.</p></div>}
    </div>
  </section>;
}
