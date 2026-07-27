"use client";
import { useState } from "react";
export default function AlertActions() { const [busy,setBusy]=useState(false); async function markAll(){setBusy(true);const r=await fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:"{}"});if(r.ok)location.reload();else setBusy(false)} return <button className="btn secondary" onClick={markAll} disabled={busy}>{busy?"Actualizando…":"Marcar todas como leídas"}</button>; }
