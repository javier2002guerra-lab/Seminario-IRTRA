import Shell from "@/components/Shell";
import { reportRange, reportStatistics } from "@/lib/reports";
import "@/app/reports.css";
import AutoRefresh from "./auto-refresh";
export const dynamic = "force-dynamic";
export default async function ReportsPage({searchParams}) {
  const range=reportRange(await searchParams),data=await reportStatistics(range);
  const metrics=[["Encuestas",data.summary.total],["Felicitaciones",data.summary.compliments],["Quejas",data.summary.complaints],["Sugerencias",data.summary.suggestions],["Pendientes de revisión",data.summary.pending_review],["Resueltas o cerradas",data.summary.resolved]];
  return <Shell active="/reportes"><div className="eyebrow">Estadísticas en tiempo real</div><h1 className="title">Reportes</h1><p className="subtitle">Actualizado {new Date(data.generatedAt).toLocaleString("es-GT")}.</p><AutoRefresh/>
    <form className="toolbar card"><label>Desde <input className="input" type="date" name="from" defaultValue={range.from}/></label><label>Hasta <input className="input" type="date" name="to" defaultValue={range.to}/></label><button className="btn">Actualizar</button><a className="btn secondary" href={`/api/reports/export?from=${range.from}&to=${range.to}`}>Descargar Excel</a><a className="btn secondary" href={`/reportes/ejecutivo?from=${range.from}&to=${range.to}`} target="_blank">Informe ejecutivo PDF</a></form>
    <div className="grid metrics report-metrics">{metrics.map(([label,value])=><div className="card metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="grid two report-grid"><Breakdown title="Clasificación" rows={data.categories} total={data.summary.total}/><Breakdown title="Prioridad" rows={data.priorities} total={data.summary.total}/><Breakdown title="Estado operativo" rows={data.statuses} total={data.summary.total}/><Breakdown title="Lugar de origen" rows={data.venues} total={data.summary.total}/><Breakdown title="Encuestas por área" rows={data.areas} total={data.summary.total} note="Una encuesta puede pertenecer a más de un área."/><ServiceTable rows={data.services}/></div>
    <div className="card" style={{marginTop:18}}><h3>Encuestas incluidas</h3><p className="muted">{data.cases.length} registros exactos entre {range.from} y {range.to}; se excluye únicamente el estado Error.</p><table><thead><tr><th>ID</th><th>Documento</th><th>Fecha</th><th>Clasificación</th><th>Prioridad</th><th>Estado</th><th>Confianza</th></tr></thead><tbody>{data.cases.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.original_name}</td><td>{new Date(r.created_at).toLocaleString("es-GT")}</td><td>{r.category}</td><td>{r.priority}</td><td>{r.status}</td><td>{Math.round(Number(r.confidence)*100)}%</td></tr>)}</tbody></table></div>
  </Shell>;
}
const pieColors=["#087d70","#e0a21d","#d87532","#71883c","#b45b78"];
function pieRows(rows){
  const sorted=[...rows].sort((a,b)=>Number(b.value)-Number(a.value));
  if(sorted.length<=5)return sorted;
  return [...sorted.slice(0,4),{label:"Otros",value:sorted.slice(4).reduce((sum,row)=>sum+Number(row.value),0)}];
}
function Breakdown({title,rows,note}){
  const slices=pieRows(rows),denominator=slices.reduce((sum,row)=>sum+Number(row.value),0);
  let cursor=0;
  const stops=slices.map((row,index)=>{const start=cursor;cursor+=denominator?Number(row.value)/denominator*100:0;return `${pieColors[index]} ${start}% ${cursor}%`}).join(",");
  return <section className="card"><h3>{title}</h3>{note&&<p className="muted">{note}</p>}{rows.length?<div className="pie-layout">
    <div className="pie-chart" style={{background:`conic-gradient(${stops})`}} role="img" aria-label={`${title}: ${slices.map(r=>`${r.label} ${r.value}`).join(", ")}`}><span><b>{denominator}</b><small>Total</small></span></div>
    <div className="pie-legend">{slices.map((row,index)=><div key={row.label}><i style={{background:pieColors[index]}}/><span>{row.label}</span><b>{row.value} <small>({denominator?Math.round(Number(row.value)/denominator*100):0}%)</small></b></div>)}</div>
  </div>:<p className="muted">Sin datos.</p>}</section>
}
function ServiceTable({rows}){return <section className="card"><h3>Calificaciones por servicio</h3><p className="muted">Cada respuesta de servicio se cuenta una vez.</p><table><thead><tr><th>Servicio</th><th>Calificación</th><th>Respuestas</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.service}-${r.rating}-${i}`}><td>{r.service}</td><td>{r.rating}</td><td><b>{r.value}</b></td></tr>)}</tbody></table></section>}
