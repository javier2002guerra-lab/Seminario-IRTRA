import Shell from "@/components/Shell";
import UploadForm from "./upload-form";
export default function Page() {
  const scannerEnabled = process.env.SCAN_WATCH_ENABLED === "true";
  return (
    <Shell active="/carga">
      <div className="eyebrow">Entrada automática</div>
      <h1 className="title">Escanear o cargar encuestas</h1>
      <p className="subtitle">
        Configure el escáner para guardar PDF, JPG o PNG en la carpeta
        <b> scanner_inbox</b>. El sistema las agrega automáticamente; también
        puede seleccionar archivos manualmente aquí.
      </p>
      <div className="card" style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
        <span style={{width:12,height:12,borderRadius:"50%",background:scannerEnabled ? "#18a66f" : "#b8871c",flex:"none"}}></span>
        <div><b>{scannerEnabled ? "Importación automática activa" : "Importación automática desactivada"}</b><p className="muted" style={{margin:"4px 0 0"}}>{scannerEnabled ? "Los originales procesados se archivan y los archivos inválidos se separan para revisión." : "Puede cargar encuestas manualmente con el formulario."}</p></div>
      </div>
      <UploadForm />
    </Shell>
  );
}
