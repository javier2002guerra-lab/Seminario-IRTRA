import {NextResponse} from "next/server";
import {currentUser} from "@/lib/auth";
import {reportRange,reportStatistics} from "@/lib/reports";
import ExcelJS from "exceljs";
export const runtime="nodejs"; export const dynamic="force-dynamic";
function columns(sheet,defs){sheet.columns=defs.map(([header,key,width])=>({header,key,width}))}
function style(sheet){sheet.views=[{state:"frozen",ySplit:1}];sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF087D70"}};sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}}}
export async function GET(req){
  const user=await currentUser();if(!user)return NextResponse.json({error:"No autorizado."},{status:401});
  const range=reportRange(Object.fromEntries(new URL(req.url).searchParams)),data=await reportStatistics(range),book=new ExcelJS.Workbook();
  book.creator="IRTRA Gestión de Encuestas";book.created=new Date(data.generatedAt);
  const summary=book.addWorksheet("Resumen");columns(summary,[["Indicador","label",32],["Valor exacto","value",18],["Definición","definition",58]]);
  [["Encuestas",data.summary.total,"Registros sin estado Error dentro del rango."],["Felicitaciones",data.summary.compliments,"Categoría Felicitación."],["Quejas",data.summary.complaints,"Categoría Queja o Mixta."],["Sugerencias",data.summary.suggestions,"Categoría Sugerencia o Mixta."],["Pendientes de revisión",data.summary.pending_review,"needs_review igual a 1."],["Resueltas o cerradas",data.summary.resolved,"Estado Resuelto o Cerrado."],["Rango",`${range.from} a ${range.to}`,"Fechas inclusivas según fecha de carga."]].forEach(([label,value,definition])=>summary.addRow({label,value,definition}));style(summary);
  for(const [name,rows] of [["Clasificación",data.categories],["Prioridades",data.priorities],["Estados",data.statuses],["Áreas",data.areas],["Sedes",data.venues],["Tendencia diaria",data.daily]]){const sheet=book.addWorksheet(name);columns(sheet,[["Categoría","label",38],["Cantidad exacta","value",20]]);rows.forEach(r=>sheet.addRow({label:r.label,value:Number(r.value)}));style(sheet)}
  const services=book.addWorksheet("Servicios");columns(services,[["Servicio","service",58],["Calificación","rating",18],["Respuestas exactas","value",20]]);data.services.forEach(r=>services.addRow({...r,value:Number(r.value)}));style(services);
  const detail=book.addWorksheet("Encuestas incluidas");columns(detail,[["ID","id",10],["Documento","original_name",48],["Fecha de carga","created_at",24],["Clasificación","category",20],["Prioridad","priority",16],["Estado","status",24],["Confianza","confidence",14],["Hotel","hotel",18],["Restaurante","restaurant",18]]);
  data.cases.forEach(r=>detail.addRow({...r,created_at:new Date(r.created_at),confidence:Number(r.confidence)}));detail.getColumn("created_at").numFmt="dd/mm/yyyy hh:mm";detail.getColumn("confidence").numFmt="0.00%";style(detail);
  const buffer=await book.xlsx.writeBuffer();return new NextResponse(buffer,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename=\"REPORTE ESTADISTICO ${range.from} a ${range.to}.xlsx\"`,"cache-control":"no-store"}});
}
