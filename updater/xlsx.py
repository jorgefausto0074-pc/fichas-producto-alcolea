"""Genera productos.xlsx a partir del documento JSON (openpyxl). Todos los valores como texto, tal cual el PDF."""
import collections
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

NAVY, ORANGE, BLUE, GREY = "071A40", "FF6633", "083DC4", "E0E0E0"
HFONT = Font(name="Arial", bold=True, color="FFFFFF", size=10)
BFONT = Font(name="Arial", size=10)
HFILL = PatternFill("solid", fgColor=NAVY)
THIN = Border(bottom=Side(style="thin", color=GREY))

SECCIONES = [("datos_jarabe", "DATOS DEL JARABE"), ("producto_terminado", "PRODUCTO TERMINADO"),
             ("alergenos_claims", "ALÉREGNOS / CLAIMS"), ("proceso", "PROCESO"),
             ("microbiologia", "MICROBIOLOGÍA (Máximos)"), ("limites_cliente", "LÍMITES CLIENTE")]
MATERIALES_P1 = ["peso_preforma_g", "color_preforma", "envase", "tipo_tapon", "asa", "pajita", "posicion_pajita",
                 "bandeja", "codifica_bandeja", "plastico_estirable", "retractilado_bandeja", "tipo_palet", "agrupacion"]

def hoja(wb, titulo, cabecera, filas, anchos=None):
    ws = wb.create_sheet(titulo)
    ws.append(cabecera)
    for c in ws[1]:
        c.font = HFONT; c.fill = HFILL; c.alignment = Alignment(wrap_text=True, vertical="center")
    for f in filas:
        ws.append(["" if v is None else (v if isinstance(v, (int, float)) else str(v)) for v in f])
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = BFONT
            if isinstance(c.value, str): c.number_format = "@"
    ws.freeze_panes = "B2"
    if filas:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(cabecera))}{len(filas)+1}"
    for i, h in enumerate(cabecera, 1):
        w = (anchos or {}).get(h)
        if w is None:
            m = max([len(str(h))] + [len(str(f[i-1])) for f in filas[:400] if f[i-1] is not None])
            w = min(max(10, m + 2), 60)
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[1].height = 30
    return ws

def si_no(v):
    return "" if v is None else ("Sí" if v else "No")

def escribe_xlsx(doc, ruta, ETIQ, ZONAS_P2):
    ps = doc["productos"]
    wb = Workbook(); wb.remove(wb.active)
    # --- Productos
    gen = ["codigo_sap", "grupo_pdf", "n_pagina_ficha", "fecha", "edicion", "producto", "marca", "formato",
           "consumo_preferente", "sap_mezcla", "sap_mezcla_casilla_2", "relacion_jarabe", "codificacion_envase",
           "aseptico", "marcado_e", "con_gas_derivado", "familia_derivada", "n_producto_ean128"] + MATERIALES_P1 + ["n_capas", "cajas_palet", "uds_caja", "uds_palet"]
    nombres = dict(ETIQ); nombres.update(grupo_pdf="Grupo (PDF de origen)", con_gas_derivado="Con gas (derivado: tiene CO2)", familia_derivada="Familia (derivada de la denominación)")
    cab = [nombres.get(k, k) for k in gen] + [e for k, e, *_ in ZONAS_P2] + ["Observaciones", "PDF", "Páginas", "Nº incidencias"]
    filas = []
    for p in ps:
        f = []
        for k in gen:
            v = p.get(k)
            f.append(si_no(v) if k in ("aseptico", "marcado_e", "con_gas_derivado") else v)
        f += [p["diseno"].get(k) for k, *_ in ZONAS_P2]
        f += [p.get("observaciones"), p["fuente"]["pdf"], "-".join(map(str, p["fuente"]["paginas"])), len(p["incidencias"])]
        filas.append(f)
    hoja(wb, "Productos", cab, filas)
    # --- Fisicoquímicos (formato largo)
    filas = []
    for p in ps:
        for sec, nom in SECCIONES:
            for clave, fila in p.get(sec, {}).items():
                vals = {k: v for k, v in fila.items() if k != "etiqueta"}
                if not vals: continue
                filas.append([p["codigo_sap"], p["producto"], p["formato"], p["grupo_pdf"], nom, fila["etiqueta"], clave,
                              fila.get("std"), fila.get("max"), fila.get("min"), fila.get("valor"),
                              fila.get("casilla_1"), fila.get("casilla_2"), fila.get("unidad")])
    hoja(wb, "Fisicoquímicos", ["Código SAP", "Producto", "Formato", "Grupo", "Sección", "Parámetro (etiqueta PDF)", "Clave",
                                "Std.", "Max.", "Min.", "Valor", "Casilla 1 (sin encabezado)", "Casilla 2 (sin encabezado)", "Unidad"], filas)
    # --- Materiales auxiliares
    filas = []
    for p in ps:
        for k in MATERIALES_P1:
            if p.get(k) not in (None, ""):
                filas.append([p["codigo_sap"], p["producto"], p["formato"], "Ficha pág. 1", ETIQ.get(k, k), p[k]])
        for k, e, *_ in ZONAS_P2:
            if k in ("validado_ficha_cliente", "creado_por", "validado_por"): continue
            v = p["diseno"].get(k)
            if v not in (None, ""):
                filas.append([p["codigo_sap"], p["producto"], p["formato"], "Ficha pág. 2 (diseños)", e, v])
    hoja(wb, "Materiales auxiliares", ["Código SAP", "Producto", "Formato", "Origen", "Campo (etiqueta PDF)", "Valor"], filas)
    # --- Paletización
    filas = []
    for p in ps:
        chk = ""
        try:
            a, b, c = (int(str(p[k]).replace(".", "")) for k in ("cajas_palet", "uds_caja", "uds_palet"))
            chk = "OK" if a * b == c else f"NO cuadra ({a}×{b}={a*b})"
        except Exception:
            chk = "no comprobable"
        filas.append([p["codigo_sap"], p["producto"], p["formato"], p["tipo_palet"], p["agrupacion"], p["n_capas"],
                      p["cajas_palet"], p["uds_caja"], p["uds_palet"], p["bandeja"], p["plastico_estirable"],
                      p["retractilado_bandeja"], chk])
    hoja(wb, "Paletización", ["Código SAP", "Producto", "Formato", "Tipo Palet:", "Agrupación:", "Nº Capas:", "Cajas/palet:",
                              "Uds/Caja:", "Uds/palet:", "Bandeja:", "Plastico Estirable:", "Retractilado bandeja:",
                              "Comprobación Cajas×Uds = Uds/palet"], filas)
    # --- Códigos G
    g = collections.defaultdict(list)
    for p in ps: g[p.get("sap_mezcla") or "(vacío)"].append(p)
    filas = [[k, len(v), ", ".join(x["codigo_sap"] for x in v), " | ".join(sorted({x["producto"] for x in v})),
              " | ".join(sorted({x["formato"] or "" for x in v})), " | ".join(sorted({x["grupo_pdf"] for x in v}))]
             for k, v in sorted(g.items())]
    hoja(wb, "Códigos G", ["SAP Mezcla (código G)", "Nº productos", "Códigos SAP", "Productos", "Formatos", "Grupo"], filas)
    # --- Incidencias
    filas = [[p["codigo_sap"], p["producto"], i["tipo"], i.get("campo"), i["detalle"]] for p in ps for i in p["incidencias"]]
    hoja(wb, "Incidencias", ["Código SAP", "Producto", "Tipo", "Campo", "Detalle"], filas)
    # --- Léeme
    ws = wb.create_sheet("Léeme", 0)
    lineas = [
        "Productos terminados · Refresco Iberia Alcolea",
        f"Generado: {doc['generado']} · {doc['n_productos']} productos",
        "Fuentes: " + "; ".join(f"{f['pdf']} ({f['grupo']})" for f in doc["fuentes"]),
        "Valores copiados como TEXTO tal cual aparecen en las fichas PDF (coma decimal, ceros a la derecha).",
        "Casilla vacía = el PDF no trae valor. 'Con gas (derivado)' = la ficha tiene algún valor de CO2.",
        "LÍMITES CLIENTE: las dos casillas no tienen encabezado en el PDF (se muestran como Casilla 1 y Casilla 2).",
        "Hojas: Productos · Fisicoquímicos · Materiales auxiliares · Paletización · Códigos G · Incidencias.",
        "Generado por el actualizador (extract.py).",
    ]
    for i, l in enumerate(lineas, 1):
        c = ws.cell(row=i, column=1, value=l)
        c.font = Font(name="Arial", size=14 if i == 1 else 10, bold=(i == 1), color=NAVY if i == 1 else "000000")
    ws.column_dimensions["A"].width = 120
    wb.save(ruta)
    arregla_estilos(ruta)


# ----------------------------------------------------------------------------- arreglo de esquema
FONT_ORDER = ["b", "i", "strike", "condense", "extend", "outline", "shadow", "u", "vertAlign", "sz", "color",
              "name", "family", "charset", "scheme"]

def arregla_estilos(ruta):
    """openpyxl escribe <name> antes que <b>/<sz>/<color> dentro de <font>; el esquema OOXML exige otro orden.
    Reordena los hijos de cada <font> para que el validador Open XML SDK dé 0 errores."""
    import zipfile, shutil, re as _re
    from lxml import etree
    tmp = str(ruta) + ".tmp"
    with zipfile.ZipFile(ruta) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/styles.xml":
                root = etree.fromstring(data)
                for font in root.iter("{*}font"):
                    hijos = list(font)
                    hijos.sort(key=lambda e: FONT_ORDER.index(etree.QName(e).localname) if etree.QName(e).localname in FONT_ORDER else 99)
                    for h in hijos: font.remove(h)
                    for h in hijos: font.append(h)
                data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
            zout.writestr(item, data)
    shutil.move(tmp, ruta)
