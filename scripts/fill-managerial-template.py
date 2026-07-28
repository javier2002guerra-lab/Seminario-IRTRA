import io, json, os, re, shutil, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string, get_column_letter

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

def safe_excel_text(value):
    value=str(value or "")
    return f"'{value}" if value.startswith(("=","+","-","@")) else value

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
                elif isinstance(cell.value,str) and re.fullmatch(r"=\+?\d+(?:[+\-]\d+)*",cell.value.replace(" ","")):
                    cell.value="=0"
                elif isinstance(cell.value,str) and cell.value.startswith("=") and "/" in cell.value and not norm(cell.value).startswith("iferror"):
                    # Empty report sections legitimately have a zero denominator.
                    # Keep charts usable instead of exposing #DIV/0! in the workbook.
                    cell.value=f"=IFERROR({cell.value[1:]},0)"
    # This sheet is a free-text historical list, not a catalog of labels.
    if "OTRAS SUGERENCIAS" in workbook.sheetnames:
        sheet=workbook["OTRAS SUGERENCIAS"]
        for row in range(4,sheet.max_row+1):
            for column in (1,2,4,5):
                sheet.cell(row,column).value=None
    clear_legacy_case_tables(workbook)

def clear_pairs(workbook,sheet_name,pairs):
    sheet=workbook[sheet_name]
    for label_col,value_col,start,end in pairs:
        for row in range(start,end+1):
            sheet.cell(row,label_col).value=None
            sheet.cell(row,value_col).value="=0"

def clear_legacy_case_tables(workbook):
    clear_pairs(workbook,"Comentarios Negativos en Rest",[
        (2,3,3,13),(6,7,3,13),(10,11,3,13),(14,15,3,13),(18,19,6,13)])
    clear_pairs(workbook,"Coment Negativos snackBovedas",[
        (1,2,6,9),(5,6,6,9),(9,10,6,9),(1,2,13,18),(5,6,13,16)])
    clear_pairs(workbook,"Comentarios Negativos en Hotele",[
        (1,2,4,30),(5,6,4,32),(9,10,4,30),(13,14,4,34),(17,18,4,36),(22,23,4,13)])
    clear_pairs(workbook,"Comentarios Negativos en Corozo",[(2,3,4,12)])
    clear_pairs(workbook,"COMENTARIOS NEGATIVOS ADMON",[
        (1,2,4,7),(5,6,4,7),(9,10,4,14),(13,14,4,8),(1,2,23,26),(5,6,23,26)])
    clear_pairs(workbook,"DISTRIBUCION DE PLAGAS",[
        (2,3,3,9),(6,7,3,9),(10,11,3,9),(14,15,3,9),
        (2,3,26,32),(6,7,26,32),(10,11,26,32),(14,15,26,32)])
    clear_pairs(workbook,"QUEJAS ACUMULADAS POR AREA",[
        (1,3,4,36),(5,7,4,14),(9,11,4,9),(13,15,4,12),(18,20,4,13)])

def write_current_complaints(workbook,rows):
    groups={
        "hotel":(1,3,4,36),"restaurant":(5,7,4,14),"snack":(9,11,4,9),
        "club":(13,15,4,12),"reception":(18,20,4,13)}
    counters=defaultdict(Counter)
    for row in rows:
        if row.get("category") not in ("Queja","Mixta"): continue
        topic=safe_excel_text((row.get("primary_topic") or "Sin tema especificado").strip())
        area=" ".join(norm(value) for value in (row.get("areas") or []))
        key=next((name for name,terms in {
            "hotel":("habitacion","hotel","cuarto"),"restaurant":("restaurante","alimento"),
            "snack":("snack","punto de venta"),"club":("club","corozos"),
            "reception":("recepcion","reservacion")}.items() if any(term in area for term in terms)),None)
        if key: counters[key][topic]+=1
    sheet=workbook["QUEJAS ACUMULADAS POR AREA"]
    for key,(label_col,count_col,start,end) in groups.items():
        for row_number,(topic,count) in zip(range(start,end+1),counters[key].most_common(end-start+1)):
            sheet.cell(row_number,label_col).value=topic
            sheet.cell(row_number,count_col).value=f"={count}"

def save_with_native_excel(template, workbook, output, original_values):
    """Use openpyxl only to calculate changed cells, then write them with Excel.
    This preserves the original XLSM package, including macros, charts and
    conditional-format extensions that openpyxl cannot round-trip.
    """
    # Some clean templates store their input placeholders as formulas and list
    # them in calcChain.xml. Keep those cells as formulas when replacing their
    # values; removing the formula would leave a dangling calc-chain entry and
    # Excel would report the exported XLSM as damaged.
    for (sheet_name,row,column),before in original_values.items():
        if not (isinstance(before,str) and before.startswith("=")):
            continue
        cell=workbook[sheet_name].cell(row,column)
        value=cell.value
        if isinstance(value,str) and value.startswith("="):
            continue
        if value is None:
            cell.value="=0"
        elif isinstance(value,bool):
            cell.value="=TRUE()" if value else "=FALSE()"
        elif isinstance(value,(int,float)):
            cell.value=f"={value}"
        else:
            cell.value=f'="{str(value).replace(chr(34), chr(34)*2)}"'
    current_values={(sheet.title,cell.row,cell.column):cell.value for sheet in workbook.worksheets for row in sheet.iter_rows() for cell in row if cell.value is not None}
    changes=[]
    for key in original_values.keys() | current_values.keys():
        before=original_values.get(key); after=current_values.get(key)
        if before != after: changes.append((*key,after))
    # El parche del paquete es el modo seguro predeterminado: no inicia Office
    # ni ejecuta las macros. Excel nativo queda como compatibilidad explícita.
    if sys.platform != "win32" or os.getenv("XLSM_USE_NATIVE_EXCEL") != "true":
        patch_xlsm(template,output,changes)
        return
    shutil.copy2(template,output)
    try:
        import win32com.client
        excel=win32com.client.DispatchEx("Excel.Application")
        excel.Visible=False; excel.DisplayAlerts=False
        excel.AutomationSecurity=3
        book=excel.Workbooks.Open(str(Path(output).resolve()),UpdateLinks=0,ReadOnly=False)
        for sheet,row,col,value in changes: book.Worksheets(sheet).Cells(row,col).Value=value
        excel.CalculateFullRebuild(); book.Save(); book.Close(SaveChanges=True); excel.Quit()
    except Exception:
        try: excel.Quit()
        except Exception: pass
        raise RuntimeError("Microsoft Excel no pudo conservar la plantilla durante la exportación.")

def patch_xlsm(template,output,changes):
    ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel_ns="http://schemas.openxmlformats.org/package/2006/relationships"
    doc_rel_ns="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(template,"r") as package:
        workbook_xml=ET.fromstring(package.read("xl/workbook.xml"))
        rels_xml=ET.fromstring(package.read("xl/_rels/workbook.xml.rels"))
        targets={node.attrib["Id"]:node.attrib["Target"] for node in rels_xml.findall(f"{{{rel_ns}}}Relationship")}
        sheet_paths={}
        for node in workbook_xml.find(f"{{{ns}}}sheets"):
            target=targets[node.attrib[f"{{{doc_rel_ns}}}id"]].lstrip("/")
            sheet_paths[node.attrib["name"]]=target if target.startswith("xl/") else f"xl/{target}"
    grouped=defaultdict(list)
    for sheet,row,col,value in changes: grouped[sheet_paths[sheet]].append((row,col,value))
    ET.register_namespace("",ns)
    with zipfile.ZipFile(template,"r") as source, zipfile.ZipFile(output,"w") as target:
        for info in source.infolist():
            content=source.read(info.filename)
            if info.filename in grouped:
                namespaces=dict(item for _,item in ET.iterparse(io.BytesIO(content),events=("start-ns",)))
                for prefix,uri in namespaces.items():
                    if prefix != "xml": ET.register_namespace(prefix,uri)
                root=ET.fromstring(content)
                used_uris=set()
                for node in root.iter():
                    for name in (node.tag,*node.attrib):
                        if name.startswith("{"): used_uris.add(name[1:].split("}",1)[0])
                for prefix,uri in namespaces.items():
                    if prefix and uri not in used_uris: root.set(f"xmlns:{prefix}",uri)
                sheet_data=root.find(f"{{{ns}}}sheetData")
                rows={int(node.attrib["r"]):node for node in sheet_data.findall(f"{{{ns}}}row")}
                for row_number,col_number,value in grouped[info.filename]:
                    row_node=rows.get(row_number)
                    if row_node is None:
                        row_node=ET.SubElement(sheet_data,f"{{{ns}}}row",{"r":str(row_number)})
                        rows[row_number]=row_node
                    coordinate=f"{get_column_letter(col_number)}{row_number}"
                    cell=next((node for node in row_node.findall(f"{{{ns}}}c") if node.attrib.get("r")==coordinate),None)
                    if cell is None: cell=ET.SubElement(row_node,f"{{{ns}}}c",{"r":coordinate})
                    for child in list(cell):
                        if child.tag in {f"{{{ns}}}v",f"{{{ns}}}f",f"{{{ns}}}is"}: cell.remove(child)
                    cell.attrib.pop("t",None)
                    if value is None: continue
                    if isinstance(value,bool):
                        cell.attrib["t"]="b"; ET.SubElement(cell,f"{{{ns}}}v").text="1" if value else "0"
                    elif isinstance(value,(int,float)):
                        ET.SubElement(cell,f"{{{ns}}}v").text=str(value)
                    elif isinstance(value,str) and value.startswith("="):
                        ET.SubElement(cell,f"{{{ns}}}f").text=value[1:]
                    else:
                        cell.attrib["t"]="inlineStr"
                        inline=ET.SubElement(cell,f"{{{ns}}}is")
                        ET.SubElement(inline,f"{{{ns}}}t").text=str(value)
                for row_node in sheet_data.findall(f"{{{ns}}}row"):
                    cells=row_node.findall(f"{{{ns}}}c")
                    for cell in cells: row_node.remove(cell)
                    cells.sort(key=lambda cell: column_index_from_string(re.match(r"[A-Z]+",cell.attrib["r"]).group()))
                    for cell in cells: row_node.append(cell)
                ordered_rows=sheet_data.findall(f"{{{ns}}}row")
                for row_node in ordered_rows: sheet_data.remove(row_node)
                for row_node in sorted(ordered_rows,key=lambda node:int(node.attrib["r"])): sheet_data.append(row_node)
                content=ET.tostring(root,encoding="utf-8",xml_declaration=True)
            target.writestr(info,content)

def main(template,data_path,output):
    rows=json.loads(Path(data_path).read_text(encoding="utf-8-sig"))
    wb=load_workbook(template,keep_vba=True,data_only=False)
    original_values={(sheet.title,cell.row,cell.column):cell.value for sheet in wb.worksheets for row in sheet.iter_rows() for cell in row if cell.value is not None}
    clear_historical_data(wb)
    write_current_complaints(wb,rows)
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
        category=row.get("category",""); topic=safe_excel_text((row.get("primary_topic") or "Sin determinar").strip())
        departments=row.get("areas") or ["Sin especificar"]; dept=DEPARTMENTS.get(norm(departments[0]),"Administracion")
        if category in ("Sugerencia","Mixta"): d["category"]["sugerencia"]+=1; d["dept_s"][dept]+=1; suggestions[topic]+=1
        if category in ("Queja","Mixta"): d["category"]["queja"]+=1; d["dept_q"][dept]+=1; complaints[topic]+=1
        venue=row.get("origin_place") or row.get("restaurant") or row.get("hotel") or "Sin especificar"
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
    save_with_native_excel(template,wb,output,original_values)

if __name__=="__main__": main(sys.argv[1],sys.argv[2],sys.argv[3])
