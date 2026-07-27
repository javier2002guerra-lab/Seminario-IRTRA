import Shell from "@/components/Shell";
import UploadForm from "./upload-form";
export default function Page() {
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
        <span style={{width:12,height:12,borderRadius:"50%",background:"#18a66f",flex:"none"}}></span>
        <div><b>Importación automática activa</b><p className="muted" style={{margin:"4px 0 0"}}>Los originales procesados se mueven a scanner_inbox/procesados y los archivos inválidos a scanner_inbox/fallidos.</p></div>
      </div>
      <UploadForm />
    </Shell>
  );
}
