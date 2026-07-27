"use client";
import { useState } from "react";
import DataEditor from "./data-editor";

export default function ReviewWorkspace({ record, ratings, canEdit }) {
  const [view, setView] = useState("original");
  const url = `/api/surveys/${record.id}/file?preview=1`;
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
      {record.mime_type === "application/pdf" ? <iframe src={url} title="Boleta original"/> : <img src={url} alt="Boleta original"/>}
      </div>
    </div>
    <div hidden={view !== "fields"}>
      {canEdit ? <DataEditor record={record} ratings={ratings}/> : <div className="card"><p>No tiene permiso para modificar esta boleta.</p></div>}
    </div>
  </section>;
}
