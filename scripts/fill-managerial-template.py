import json, re, shutil, sys, unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string

MONTHS = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,"julio":7,"agosto":8,"septiembre":9,"octubre":10,"noviembre":11,"diciembre":12}
SERVICE_COLUMNS = {
 "cortesia del personal":"B", "prontitud en chequeo de ingreso y salida":"H",
 "limpieza de habitaciones":"N", "limpieza de sanitarios":"T",
 "mantenimiento de instalaciones":"Z", "jardines":"AF", "servicio de maleteros":"AL",
 "calidad de comida":"AR", "prontitud en revision de inventarios":"AX",
 "servicio club los corozos":"BD", "servicio en tiendas de conveniencia":"BJ",
 "servicio en personal de eventos":"BP", "servicio en restaurante":"BV", "personal de seguridad":"CB",
}
DEPARTMENTS = {"habitaciones":"Cuartos","restaurantes":"A&B","seguridad":"Seguridad","mantenimiento":"Mantenimiento","eventos":"Eventos","tecnologia":"Informatica","sin especificar":"Administracion"}

def norm(value):
    value=unicodedata.normalize("NFKD",str(value or "")).encode("ascii","ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+"," ",value).split())

def month_of(row):
    raw=str(row.get("general",{}).get("visit_date") or row.get("created_at") or "")
    for fmt in ("%Y-%m-%d","%d/%m/%Y","%d-%m-%Y","%d %B %Y"):
        try:return datetime.strptime(raw[:10] if fmt=="%Y-%m-%d" else raw,fmt).month
        except ValueError:pass
    for name,month in MONTHS.items():
        if name in norm(raw): return month
    return datetime.fromisoformat(str(row.get("created_at")).replace("Z","+00:00")).month

def month_rows(ws):
    found={}
    for row in range(1,ws.max_row+1):
        for col in range(1,min(ws.max_column,5)+1):
            value=norm(ws.cell(row,col).value)
            if value in MONTHS: found[MONTHS[value]]=row
    return found

def tri(value):
    value=norm(value)
    if value.startswith("si") or value in {"x si","afiliado"}: return "si"
    if value.startswith("no") or value in {"x no","no afiliado"}: return "no"
    return "sin"

def setv(ws,cell,value): ws[cell]=int(value or 0)
def clear_and_write(ws,label_col,count_col,rows,items):
    for row in rows: ws[f"{label_col}{row}"]=None; ws[f"{count_col}{row}"]=None
    for row,(label,count) in zip(rows,items): ws[f"{label_col}{row}"]=label; ws[f"{count_col}{row}"]=count

def clear_historical_data(workbook):
    """Remove values bundled in the reporting template without touching layout.
    Formulas, labels, styles, charts and macros remain intact.
    """
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if isinstance(cell.value,(int,float)) and not isinstance(cell.value,bool):
                    cell.value=None
    # This sheet is a free-text historical list, not a catalog of labels.
    if "OTRAS SUGERENCIAS" in workbook.sheetnames:
        sheet=workbook["OTRAS SUGERENCIAS"]
        for row in range(4,sheet.max_row+1):
            for column in (1,2,4,5):
                sheet.cell(row,column).value=None

def save_with_native_excel(template, workbook, output):
    """Use openpyxl only to calculate changed cells, then write them with Excel.
    This preserves the original XLSM package, including macros, charts and
    conditional-format extensions that openpyxl cannot round-trip.
    """
    draft=Path(output).with_suffix(".draft.xlsm")
    workbook.save(draft)
    original=load_workbook(template,keep_vba=True,data_only=False,read_only=True)
    generated=load_workbook(draft,keep_vba=True,data_only=False,read_only=True)
    changes=[]
    for sheet in generated.sheetnames:
        source=original[sheet]; target=generated[sheet]
        max_row=max(source.max_row,target.max_row); max_col=max(source.max_column,target.max_column)
        for row in range(1,max_row+1):
            for col in range(1,max_col+1):
                before=source.cell(row,col).value; after=target.cell(row,col).value
                if before != after: changes.append((sheet,row,col,after))
    original.close(); generated.close(); draft.unlink(missing_ok=True)
    shutil.copy2(template,output)
    try:
        import win32com.client
        excel=win32com.client.DispatchEx("Excel.Application")
        excel.Visible=False; excel.DisplayAlerts=False
        book=excel.Workbooks.Open(str(Path(output).resolve()),UpdateLinks=0,ReadOnly=False)
        for sheet,row,col,value in changes: book.Worksheets(sheet).Cells(row,col).Value=value
        book.RefreshAll(); excel.CalculateFullRebuild(); book.Save(); book.Close(SaveChanges=True); excel.Quit()
    except Exception:
        try: excel.Quit()
        except Exception: pass
        raise RuntimeError("Microsoft Excel no pudo conservar la plantilla durante la exportación.")

def main(template,data_path,output):
    rows=json.loads(Path(data_path).read_text(encoding="utf-8-sig"))
    wb=load_workbook(template,keep_vba=True,data_only=False)
    clear_historical_data(wb)
    monthly=defaultdict(lambda:{"affiliate":Counter(),"reason":Counter(),"recommend":Counter(),"resolved":Counter(),"collab":Counter(),"attendant":Counter(),"category":Counter(),"services":defaultdict(Counter),"dept_s":Counter(),"dept_q":Counter()})
    suggestions=Counter(); complaints=Counter(); venue_services=defaultdict(lambda:defaultdict(lambda:defaultdict(Counter))); venue_negative=defaultdict(Counter)
    for row in rows:
        m=month_of(row); d=monthly[m]; g=row.get("general",{}); n=row.get("numbered",{})
        d["affiliate"][tri(g.get("affiliate_status"))]+=1
        reason=norm(g.get("visit_reason")); matched=False
        for key,words in {"huesped":["huesped","hostal"],"restaurante":["restaurante"],"evento":["evento"],"club":["club","corozos"]}.items():
            if any(w in reason for w in words): d["reason"][key]+=1; matched=True
        if not matched:d["reason"]["sin"]+=1
        d["recommend"][tri(n.get("item_7"))]+=1; d["resolved"][tri(n.get("item_10"))]+=1; d["collab"][tri(n.get("item_11"))]+=1
        attendant=norm(n.get("item_12")); role=next((x for x in ["maletero","eventos","cajero","recepcion","camarera","mesero","masajista"] if x in attendant),"otro"); d["attendant"][role]+=1
        category=row.get("category",""); topic=(row.get("primary_topic") or "Sin determinar").strip()
        departments=row.get("areas") or ["Sin especificar"]; dept=DEPARTMENTS.get(norm(departments[0]),"Administracion")
        if category in ("Sugerencia","Mixta"): d["category"]["sugerencia"]+=1; d["dept_s"][dept]+=1; suggestions[topic]+=1
        if category in ("Queja","Mixta"): d["category"]["queja"]+=1; d["dept_q"][dept]+=1; complaints[topic]+=1
        venue=row.get("restaurant") or row.get("hotel") or "Sin especificar"
        for rating in row.get("ratings",[]):
            service=norm(rating.get("service_name")); quality=norm(rating.get("rating"));
            if quality in ("excelente","bueno","regular","malo"):
                d["services"][service][quality]+=1; venue_services[m][norm(venue)][service][quality]+=1
        if category in ("Queja","Mixta"): venue_negative[norm(venue)][topic]+=1

    ws=wb["Preguntas directas"]
    for m,r in month_rows(ws).items():
        d=monthly[m]
        for cell,key in zip(("B","C","D"),("si","no","sin")):setv(ws,f"{cell}{r}",d["affiliate"][key])
        for cell,key in zip(("H","I","J","K","L"),("huesped","restaurante","evento","club","sin")):setv(ws,f"{cell}{r}",d["reason"][key])
        for start,bucket in (("O","recommend"),("T","resolved"),("Y","collab")):
            base=column_index_from_string(start)
            for off,key in enumerate(("si","no","sin")):ws.cell(r,base+off).value=d[bucket][key]
        for cell,key in zip(("AD","AE","AF","AG","AH","AI","AJ","AK"),("maletero","eventos","cajero","recepcion","camarera","mesero","masajista","otro")):setv(ws,f"{cell}{r}",d["attendant"][key])

    ws=wb["Nivel de Calidad"]
    for m,r in month_rows(ws).items():
        for service,start in SERVICE_COLUMNS.items():
            base=column_index_from_string(start)
            for off,q in enumerate(("excelente","bueno","regular","malo")):ws.cell(r,base+off).value=monthly[m]["services"][service][q]
    ws=wb["Sugerencia o Queja"]
    for m,r in month_rows(ws).items():setv(ws,f"C{r}",monthly[m]["category"]["sugerencia"]);setv(ws,f"D{r}",monthly[m]["category"]["queja"])
    for sheet,bucket in (("Sujerencias por departamento","dept_s"),("Quejas por departamento","dept_q")):
        ws=wb[sheet]; label_rows={norm(ws.cell(r,c).value):r for r in range(1,ws.max_row+1) for c in range(1,3)}
        for dept in ("Cuartos","A&B","Seguridad","Mantenimiento","HACCP","Eventos","Corozos","Informatica","Administracion"):
            r=label_rows.get(norm(dept))
            if r:
                for m,col in zip(range(1,13),range(3,15)):ws.cell(r,col).value=monthly[m][bucket][dept]
    clear_and_write(wb["sugerencias mas Frecuentes"],"B","C",range(6,23),suggestions.most_common(17))
    clear_and_write(wb["QUEJAS MAS FRECUENTES"],"B","C",range(5,14),complaints.most_common(9))

    venue_sheets={"la hacienda":"Calificacion La Hacienda","arekas":"Calificacion Las Arecas","kapahapa":"Calificacion Kapa Hapa","corozos":"Calificacion Rest. Corozos"}
    for venue,sheet in venue_sheets.items():
        ws=wb[sheet]
        for m,r in month_rows(ws).items():
            food=venue_services[m][venue]["calidad de comida"]; service=venue_services[m][venue]["servicio en restaurante"]
            setv(ws,f"I{r}",food["excelente"]+food["bueno"]);setv(ws,f"J{r}",food["regular"]);setv(ws,f"K{r}",food["malo"])
            setv(ws,f"N{r}",service["excelente"]+service["bueno"]);setv(ws,f"O{r}",service["regular"]);setv(ws,f"P{r}",service["malo"])
    hotel_sheets={"san martin":"Calificacion  San Martin","palajunoj":"Calificacion  Palajunoj","santa cruz":"Calificacion  Santa Cruz","rancheria":"Calificacion Rancheria"}
    for venue,sheet in hotel_sheets.items():
        ws=wb[sheet]
        for m,r in month_rows(ws).items():
            allq=Counter()
            for values in venue_services[m][venue].values():allq.update(values)
            setv(ws,f"C{r}",allq["excelente"]+allq["bueno"]);setv(ws,f"D{r}",allq["regular"]);setv(ws,f"E{r}",allq["malo"])
    wb.calculation.fullCalcOnLoad=True; wb.calculation.forceFullCalc=True; wb.calculation.calcMode="auto"
    save_with_native_excel(template,wb,output)

if __name__=="__main__": main(sys.argv[1],sys.argv[2],sys.argv[3])
