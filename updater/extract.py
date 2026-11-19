#!/usr/bin/env python3
"""
Extractor de fichas técnicas de PRODUCTO TERMINADO · Refresco Iberia Alcolea.

Lee los informes PDF de Access ("Informe Alcolea Asépticos" / "Informe Alcolea No Asépticos"),
2 páginas por producto, y genera:
  datos/productos.json   (fuente de verdad para la futura app)
  datos/productos.xlsx   (Productos, Fisicoquímicos, Materiales auxiliares, Códigos G, Incidencias, Léeme)
  datos/imagenes/<SAP>/<casilla>.jpg  (dibujos de la página 2: botella, etiqueta, tapón, retráctil, mosaico...)
  datos/cambios/<fecha>/ (productos_anterior.json + cambios.md/.xlsx/.json) y datos/cambios/ultimo.json
  (ver build/cambios.py; el flujo recomendado para actualizar es build/actualizar.py)

Uso (ver CONOCIMIENTO.md):
  build/.venv/bin/python build/extract.py                       # usa el PDF más reciente de cada grupo en fuentes/
  build/.venv/bin/python build/extract.py --pdf nuevo.pdf ...   # PDFs concretos (el grupo se deduce del nombre)
  opciones: --sin-imagenes  --solo-diff (no escribe nada, solo informa cambios)  --sin-bundle
  Al final regenera app-data/ (build/bundle.py: paquete cifrado para la app), salvo --sin-bundle.

Regla: los valores se guardan como TEXTO exactamente como aparecen en el PDF (coma decimal, ceros, mayúsculas).
"""
import argparse, collections, datetime as dt, json, os, re, shutil, sys, unicodedata
from pathlib import Path

import pdfplumber

BASE = Path(os.environ["PT_BASE"]).resolve() if os.environ.get("PT_BASE") else Path(__file__).resolve().parent.parent   # PT_BASE = carpeta de trabajo (CI)
FUENTES = BASE / "fuentes"
DATOS = BASE / "datos"

# ----------------------------------------------------------------------------- utilidades
def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s.lower()).strip("_")
    return s

def limpia(t):
    t = t.replace("(cid:9)", " ").replace("\t", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t

def grupo_de_nombre(nombre):
    n = slug(nombre)
    if "no_asept" in n: return "No asépticos"
    if "asept" in n: return "Asépticos"
    return None

# ----------------------------------------------------------------------------- plantilla página 1
# Casillas de la parte superior: (x0, top) aproximados -> (clave, etiqueta en el PDF)
SUPERIOR = [
    ((360, 52), "codigo_sap", "CÓDIGO SAP"),
    ((453, 52), "n_pagina_ficha", "Nº PÁGINA"),
    ((360, 84), "fecha", "FECHA"),
    ((453, 84), "edicion", "EDICIÓN"),
    ((95, 103), "producto", "Producto:"),
    ((405, 102), "marca", "(casilla sin etiqueta a la derecha de Producto)"),
    ((89, 116), "formato", "Formato:"),
    ((371, 116), "consumo_preferente", "Consumo preferente:"),
    ((106, 131), "sap_mezcla", "SAP Mezcla:"),
    ((179, 131), "sap_mezcla_casilla_2", "(2ª casilla sin etiqueta junto a SAP Mezcla)"),
    ((231, 131), "sap_mezcla_casilla_2", "(2ª casilla sin etiqueta junto a SAP Mezcla)"),
    ((388, 130), "relacion_jarabe", "Relacion jarabe"),
    ((148, 147), "codificacion_envase", "Codificación envase"),
    ((416, 173), "n_producto_ean128", "NºProducto para EAN 128:"),
    ((123, 190), "peso_preforma_g", "Peso preforma (g):"),
    ((303, 190), "color_preforma", "Color preforma"),
    ((86, 204), "envase", "Envase:"),
    ((103, 220), "tipo_tapon", "TipoTapón:"),
    ((275, 220), "asa", "Asa:"),
    ((75, 235), "pajita", "Pajita:"),
    ((320, 235), "posicion_pajita", "Posicion pajita:"),
    ((84, 249), "bandeja", "Bandeja:"),
    ((337, 249), "codifica_bandeja", "Codifica. bandeja:"),
    ((120, 268), "plastico_estirable", "Plastico Estirable:"),
    ((340, 268), "retractilado_bandeja", "Retractilado bandeja:"),
    ((101, 283), "tipo_palet", "Tipo Palet:"),
    ((366, 284), "agrupacion", "Agrupación:"),
    ((132, 297), "n_capas", "Nº Capas:"),
    ((326, 309), "uds_caja", "Uds/Caja:"),
    ((473, 309), "uds_palet", "Uds/palet:"),
    ((107, 311), "cajas_palet", "Cajas/palet:"),
    ((36, 764), "observaciones", "(recuadro de observaciones al pie)"),
]
CAMPOS_SUPERIOR = list(dict.fromkeys(k for _, k, _ in SUPERIOR))
ETIQ_SUPERIOR = {k: e for _, k, e in SUPERIOR}
ETIQ_SUPERIOR.update(aseptico="Aseptico: (casilla de verificación)", marcado_e="Marcado E: (casilla de verificación)")

# Tablas: secciones y columnas por x0 de la casilla
SECCIONES_IZQ = [  # (top_min, top_max, seccion, {x0: columna})
    (345, 490, "datos_jarabe", {79: "unidad", 126: "std", 177: "max", 225: "min"}),
    (490, 570, "alergenos_claims", {84: "valor", 104: "valor", 225: "valor"}),
    (570, 650, "proceso", {143: "std", 191: "max", 235: "min"}),
    (650, 700, "microbiologia", {132: "valor", 174: "unidad"}),
    (700, 762, "limites_cliente", {194: "casilla_1", 233: "casilla_2"}),
]
SECCION_DCHA = (345, 762, "producto_terminado", {332: "unidad", 397: "valor", 401: "std", 445: "max", 485: "min"})
CABECERAS = {"DATOS DEL JARABE", "PRODUCTO TERMINADO", "ALÉREGNOS / CLAIMS", "PROCESO", "MICROBIOLOGÍA (Máximos)",
             "LÍMITES CLIENTE", "Std.", "Max.", "Min.", "(*) Monster en mg/100 ml ácido", "*",
             "TABLA DE PRODUCTOS", "FICHA TÉCNICA", "CÓDIGO SAP", "Nº PÁGINA", "FECHA", "EDICIÓN"}
TEXTO_FIJO = {"(RESTO DE VALORES DENTRO DE MARGENES)"}

# ----------------------------------------------------------------------------- plantilla página 2
# zonas de texto (sin casilla en muchos casos): (clave, etiqueta, x0_min, x0_max, top_min, top_max)
ZONAS_P2 = [
    ("etiqueta_ean", "Diseño Etiqueta/Lata: EAN:", 260, 400, 102, 117),
    ("botella_tipo", "Diseño Botella · Tipo:", 50, 150, 117, 132),
    ("etiqueta_version", "Diseño Etiqueta/Lata · Versión:", 150, 280, 117, 132),
    ("etiqueta_version_casilla_2", "Diseño Etiqueta/Lata · Versión (2ª casilla)", 280, 400, 117, 132),
    ("tapon_sap", "Diseño Tapón/Tapa · SAP", 400, 457, 117, 132),
    ("tapon_sap_casilla_2", "Diseño Tapón/Tapa · SAP (2ª casilla)", 457, 525, 117, 132),
    ("cluster_ean", "Diseño Cluster · EAN", 100, 248, 262, 278),
    ("cluster_version", "Diseño Cluster · Versión", 100, 248, 278, 292),
    ("asa_n", "Diseño Asa · N. ASA", 248, 380, 262, 292),
    ("separador", "Separador:", 380, 525, 262, 292),
    ("retrac_ean", "Retrác /Et. Paq. · EAN", 95, 200, 420, 437),
    ("et_caja_ean", "Et. Caja · EAN:", 200, 360, 420, 437),
    ("et_palet_ean", "Et. Palet · EAN:", 360, 525, 420, 437),
    ("retrac_version", "Retrác /Et. Paq. · Versión:", 60, 138, 437, 452),
    ("retrac_version_casilla_2", "Retrác /Et. Paq. · Versión (2ª casilla)", 138, 200, 437, 452),
    ("et_caja_version", "Et. Caja · Versión:", 200, 360, 437, 452),
    ("et_palet_version", "Et. Palet · Versión", 360, 525, 437, 452),
    ("bandeja_ean", "Diseño bandeja · EAN:", 95, 270, 588, 602),
    ("mosaico", "Mosaico:", 270, 525, 588, 602),
    ("bandeja_version", "Diseño bandeja · Versión:", 60, 160, 603, 620),
    ("bandeja_version_casilla_2", "Diseño bandeja · Versión (2ª casilla)", 160, 270, 603, 620),
    ("validado_ficha_cliente", "Validado con ficha cliente:", 150, 525, 757, 778),
    ("creado_por", "Creado Por:", 90, 300, 778, 800),
    ("validado_por", "Validado Por:", 300, 525, 778, 800),
]
# recuadros de imagen de la página 2: (clave, x0, x1, top, bottom)
IMAGENES_P2 = [
    ("botella", 36, 148, 134, 264), ("etiqueta", 152, 385, 134, 264), ("tapon", 391, 520, 134, 264),
    ("cluster", 37, 249, 293, 423), ("asa", 252, 384, 293, 423), ("separador", 388, 517, 293, 423),
    ("retractil_et_paquete", 37, 204, 454, 588), ("etiqueta_caja", 207, 359, 454, 589),
    ("etiqueta_palet", 360, 516, 454, 589), ("bandeja", 36, 273, 623, 756), ("mosaico", 275, 515, 623, 756),
]

# ----------------------------------------------------------------------------- geometría
def casillas(page):
    """Reconstruye las casillas (rectángulos) a partir de los bordes finos que dibuja Access."""
    rects = page.rects
    v = [r for r in rects if r["x1"] - r["x0"] < 0.5 and r["bottom"] - r["top"] > 5]
    h = [r for r in rects if r["bottom"] - r["top"] < 0.5 and r["x1"] - r["x0"] > 5]
    out = set()
    for t in h:
        for l in v:
            if abs(l["x0"] - t["x0"]) < 1 and abs(l["top"] - t["top"]) < 1:
                out.add((round(t["x0"], 1), round(t["x1"], 1), round(t["top"], 1), round(l["bottom"], 1)))
                break
    return sorted(out, key=lambda b: (b[2], b[0]))

def casilla_de(w, boxes):
    cx = (w["x0"] + w["x1"]) / 2; cy = (w["top"] + w["bottom"]) / 2
    hit = [b for b in boxes if b[0] - 1 <= cx <= b[1] + 1 and b[2] - 1 <= cy <= b[3] + 1]
    hit.sort(key=lambda b: (b[1] - b[0]) * (b[3] - b[2]))
    return hit[0] if hit else None

def une(words):
    """Une palabras de una casilla en orden de lectura (líneas por 'top')."""
    ws = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lineas = []
    for w in ws:
        if lineas and abs(lineas[-1][0]["top"] - w["top"]) < 3:
            lineas[-1].append(w)
        else:
            lineas.append([w])
    return limpia(" ".join(" ".join(x["text"] for x in sorted(l, key=lambda w: w["x0"])) for l in lineas))

def etiquetas_fila(words):
    """Etiquetas en negrita, uniendo trozos contiguos en la misma línea (p.ej. 'DENSIDAD' + '20/4')."""
    b = sorted([w for w in words if "Bold" in w["fontname"]], key=lambda w: (round(w["top"]), w["x0"]))
    out = []
    for w in b:
        t = limpia(w["text"])
        if t in CABECERAS: continue
        if out and abs(out[-1]["top"] - w["top"]) < 3 and 0 <= w["x0"] - out[-1]["x1"] < 15:
            out[-1]["text"] += " " + t; out[-1]["x1"] = w["x1"]
            continue
        out.append(dict(text=t, first=t, x0=w["x0"], x1=w["x1"], top=w["top"]))
    return out

def cerca(val, opciones, tol=6):
    best = min(opciones, key=lambda o: abs(o - val))
    return best if abs(best - val) <= tol else None

# ----------------------------------------------------------------------------- página 1
def parse_p1(page, inc):
    words = page.extract_words(keep_blank_chars=True, x_tolerance=1.5, extra_attrs=["fontname", "size"])
    boxes = casillas(page)
    labels = etiquetas_fila(words)
    rec = {k: None for k in CAMPOS_SUPERIOR}
    tablas = collections.OrderedDict()
    nombre_casilla = {}
    for b in boxes:
        x0, x1, top, bot = b
        if top >= 345 and top < 762:
            if x0 >= 290:
                tmin, tmax, sec, cols = SECCION_DCHA; side = lambda l: l["x0"] > 270
            else:
                sec = cols = None
                for tmin, tmax, s, c in SECCIONES_IZQ:
                    if tmin <= top < tmax: sec, cols = s, c
                side = lambda l: l["x0"] < 270
            col = cerca(x0, list(cols), 4)
            if col is None: continue
            cand = [l for l in labels if side(l) and l["x1"] <= x0 + 1 and abs(l["top"] - (top + 3)) <= 5]
            if not cand: continue
            cand.sort(key=lambda l: (abs(l["top"] - (top + 3)), -l["x0"]))
            lab = cand[0]
            nombre_casilla[b] = (sec, slug(lab["first"]), lab["text"], cols[col])
        else:
            for (ax, at), k, e in SUPERIOR:
                if abs(ax - x0) <= 3 and abs(at - top) <= 3:
                    nombre_casilla[b] = (None, k, e, None)
    contenido = collections.defaultdict(list)
    fuera = []
    for w in words:
        if "Bold" in w["fontname"]: continue
        t = limpia(w["text"])
        if not t: continue
        if t in TEXTO_FIJO: continue
        b = casilla_de(w, boxes)
        if b is None or b not in nombre_casilla:
            fuera.append(w); continue
        contenido[b].append(w)
        if w["x1"] > b[1] + 2 or w["x0"] < b[0] - 2 or w["bottom"] > b[3] + 3:
            sec, k, e, c = nombre_casilla[b]
            inc.append(dict(tipo="texto_excede_casilla", campo=f"{sec+'.' if sec else ''}{k}{'.'+c if c else ''}",
                            detalle=f"'{t}' se sale de su casilla; en el PDF impreso puede verse recortado"))
    geom = {}
    for b, ws in contenido.items():
        sec, k, e, c = nombre_casilla[b]
        val = une(ws)
        clave_g = f"{sec+'.' if sec else ''}{k}{'.'+c if c else ''}"
        ux = [min(w["x0"] for w in ws), max(w["x1"] for w in ws), min(w["top"] for w in ws), max(w["bottom"] for w in ws)]
        geom.setdefault(clave_g, []).append(dict(casilla=list(b), texto=[round(x, 1) for x in ux]))
        if sec is None:
            if rec.get(k) and val != rec[k]:
                rec[k] = rec[k] + " | " + val
            else:
                rec[k] = val
        else:
            t = tablas.setdefault(sec, collections.OrderedDict())
            fila = t.setdefault(k, {"etiqueta": e})
            if fila.get(c) and fila[c] != val:
                fila[c] += " | " + val
            else:
                fila[c] = val
    # palabras fuera de casilla
    for w in fuera:
        t = limpia(w["text"])
        if t in ("ml", "mL") and w["x0"] < 125 and 574 < w["top"] < 592:
            tablas.setdefault("proceso", collections.OrderedDict()).setdefault("contenido", {"etiqueta": "CONTENIDO:"})["unidad"] = t
            geom["proceso.contenido.unidad"] = [dict(casilla=None, texto=[round(w["x0"], 1), round(w["x1"], 1), round(w["top"], 1), round(w["bottom"], 1)])]
        elif "Temp_Paster" in t:
            inc.append(dict(tipo="error_plantilla_access", campo="proceso.t_paster.std",
                            detalle=f"La casilla 't. PASTER : (seg)' Std. contiene el texto de control '{t}' (en el PDF solo se ve el final 'r_Min'); no es un valor real"))
        else:
            inc.append(dict(tipo="texto_fuera_de_casilla", campo=None,
                            detalle=f"'{t}' en x={w['x0']:.0f}, y={w['top']:.0f} sin casilla asignada"))
    # etiquetas de filas aunque estén vacías (para conservar la estructura completa) y orden de lectura (arriba→abajo)
    orden = {}
    for b, (sec, k, e, c) in nombre_casilla.items():
        if sec:
            tablas.setdefault(sec, collections.OrderedDict()).setdefault(k, {"etiqueta": e})
            orden[(sec, k)] = min(orden.get((sec, k), 9999), b[2])
    for sec in list(tablas):
        filas = sorted(tablas[sec].items(), key=lambda kv: orden.get((sec, kv[0]), 9999))
        tablas[sec] = collections.OrderedDict((k, collections.OrderedDict(sorted(v.items(), key=lambda x: ["etiqueta", "valor", "std", "max", "min", "casilla_1", "casilla_2", "unidad"].index(x[0])))) for k, v in filas)
    # casillas de verificación
    lines = page.lines + page.curves
    def marcada(xmin, xmax):
        cb = [r for r in page.rects if 7 < r["x1"] - r["x0"] < 9.5 and 7 < r["bottom"] - r["top"] < 9.5
              and xmin <= r["x0"] <= xmax and 168 < r["top"] < 192]
        if len(cb) != 1:
            inc.append(dict(tipo="casilla_verificacion_no_encontrada", campo=None, detalle=f"x {xmin}-{xmax}"))
            return None
        r = cb[0]
        return any(l["x0"] >= r["x0"] - 1 and l["x1"] <= r["x1"] + 1 and l["top"] >= r["top"] - 1 and l["bottom"] <= r["bottom"] + 1 for l in lines)
    rec["aseptico"] = marcada(85, 110)
    rec["marcado_e"] = marcada(240, 260)
    # casillas no reconocidas con texto
    return rec, tablas, geom

# ----------------------------------------------------------------------------- página 2
def parse_p2(page, inc):
    words = page.extract_words(keep_blank_chars=True, x_tolerance=1.5, extra_attrs=["fontname", "size"])
    rec = {k: None for k, *_ in ZONAS_P2}
    zonas = collections.defaultdict(list)
    hdr = {}
    for w in words:
        if "Bold" in w["fontname"]: continue
        t = limpia(w["text"])
        if not t: continue
        if w["top"] < 100:
            hdr.setdefault((round(w["x0"] / 60), round(w["top"] / 20)), t); continue
        z = [k for k, e, a, bx, c, d in ZONAS_P2 if a <= w["x0"] < bx and c <= w["top"] < d]
        if len(z) != 1:
            inc.append(dict(tipo="texto_fuera_de_zona_p2", campo=None,
                            detalle=f"'{t}' en x={w['x0']:.0f}, y={w['top']:.0f} (página 2)"))
            continue
        zonas[z[0]].append(w)
    geom = {}
    for k, ws in zonas.items():
        rec[k] = une(ws)
        geom["diseno." + k] = [dict(casilla=None, texto=[round(min(w["x0"] for w in ws), 1), round(max(w["x1"] for w in ws), 1),
                                                       round(min(w["top"] for w in ws), 1), round(max(w["bottom"] for w in ws), 1)])]
    imgs = []
    for k, x0, x1, t, b in IMAGENES_P2:
        hay = any(im["x0"] < x1 and im["x1"] > x0 and im["top"] < b and im["bottom"] > t for im in page.images)
        if hay: imgs.append(k)
    return rec, imgs, geom

# ----------------------------------------------------------------------------- PDF completo
def cabecera(words):
    def debajo(lbl):
        h = [w for w in words if limpia(w["text"]) == lbl]
        if not h: return None
        h = h[0]
        c = [w for w in words if 8 < w["top"] - h["top"] < 25 and w["x0"] < h["x1"] + 5 and w["x1"] > h["x0"] - 5]
        return limpia(c[0]["text"]) if c else None
    return debajo("CÓDIGO SAP"), debajo("Nº PÁGINA"), debajo("FECHA"), debajo("EDICIÓN")

def parse_pdf(path, grupo, log=print):
    productos = []
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        tipos = []
        for i, p in enumerate(pdf.pages):
            txt = p.extract_text() or ""
            tipos.append("p1" if "DATOS DEL JARABE" in txt else ("p2" if "Diseño Botella" in txt else "otra"))
        i = 0
        while i < n:
            if tipos[i] != "p1":
                log(f"  ! página {i+1} de {path.name} no es una página 1 de ficha ({tipos[i]}); se omite")
                i += 1; continue
            inc = []
            pag1 = i + 1
            p1 = pdf.pages[i]
            rec, tablas, geom1 = parse_p1(p1, inc)
            w1 = p1.extract_words(keep_blank_chars=True, x_tolerance=1.5)
            cab1 = cabecera(w1)
            p2rec, imgs, p2pag, geom2 = {}, [], None, {}
            if i + 1 < n and tipos[i + 1] == "p2":
                p2 = pdf.pages[i + 1]
                cab2 = cabecera(p2.extract_words(keep_blank_chars=True, x_tolerance=1.5))
                if cab2 != cab1:
                    inc.append(dict(tipo="cabecera_p2_distinta", campo=None, detalle=f"p1 {cab1} / p2 {cab2}"))
                p2rec, imgs, geom2 = parse_p2(p2, inc)
                p2pag = i + 2
                i += 2
            else:
                inc.append(dict(tipo="falta_pagina_2", campo=None, detalle=f"página {i+1}"))
                i += 1
            prod = collections.OrderedDict()
            prod["codigo_sap"] = rec.pop("codigo_sap")
            prod["grupo_pdf"] = grupo
            for k in CAMPOS_SUPERIOR:
                if k in rec and k != "observaciones": prod[k] = rec[k]
            prod["aseptico"] = rec.get("aseptico")
            prod["marcado_e"] = rec.get("marcado_e")
            for sec in ["datos_jarabe", "producto_terminado", "alergenos_claims", "proceso", "microbiologia", "limites_cliente"]:
                prod[sec] = tablas.get(sec, {})
            prod["observaciones"] = rec.get("observaciones")
            prod["diseno"] = p2rec
            prod["imagenes_disponibles"] = imgs
            prod["fuente"] = {"pdf": path.name, "paginas": [x for x in (pag1, p2pag) if x]}
            prod["incidencias"] = inc
            prod["_geom"] = {"p1": geom1, "p2": geom2}
            productos.append(prod)
    return productos

TIPOS_CONTROL = {"rango_incoherente_en_pdf", "valor_no_numerico_en_pdf", "paletizacion_no_cuadra",
                 "paletizacion_no_comprobable", "campo_clave_vacio", "sap_mezcla_no_es_codigo_G",
                 "codigo_sap_formato_raro", "sap_duplicado", "aseptico_incoherente"}

def _num(v):
    try: return float(str(v).replace(",", "."))
    except Exception: return None

def controles(p):
    """Controles de coherencia: se ANOTAN como incidencias, nunca se corrigen los valores."""
    p["incidencias"] = [i for i in p["incidencias"] if i["tipo"] not in TIPOS_CONTROL]
    inc = p["incidencias"]
    for sec in ("datos_jarabe", "producto_terminado", "proceso"):
        for k, f in p.get(sec, {}).items():
            s, mx, mn = (_num(f.get(c)) if f.get(c) else None for c in ("std", "max", "min"))
            prob = []
            if mx is not None and mn is not None and mx < mn: prob.append("Max. < Min.")
            if s is not None and mx is not None and s > mx: prob.append("Std. > Max.")
            if s is not None and mn is not None and s < mn: prob.append("Std. < Min.")
            if prob:
                inc.append(dict(tipo="rango_incoherente_en_pdf", campo=f"{sec}.{k}",
                                detalle=f"{f['etiqueta']} Std={f.get('std')} Max={f.get('max')} Min={f.get('min')}: " + ", ".join(prob)))
    for sec in ("datos_jarabe", "producto_terminado", "proceso", "limites_cliente"):
        for k, f in p.get(sec, {}).items():
            for c in ("std", "max", "min", "casilla_1", "casilla_2"):
                v = f.get(c)
                if v and _num(v) is None:
                    inc.append(dict(tipo="valor_no_numerico_en_pdf", campo=f"{sec}.{k}.{c}", detalle=f"{f['etiqueta']} {c} = '{v}'"))
    try:
        a, b, c = (int(p[k]) for k in ("cajas_palet", "uds_caja", "uds_palet"))
        if a * b != c:
            inc.append(dict(tipo="paletizacion_no_cuadra", campo="uds_palet", detalle=f"Cajas/palet {a} × Uds/Caja {b} = {a*b} ≠ Uds/palet {c}"))
    except Exception:
        inc.append(dict(tipo="paletizacion_no_comprobable", campo="uds_palet",
                        detalle=f"Cajas/palet={p.get('cajas_palet')} Uds/Caja={p.get('uds_caja')} Uds/palet={p.get('uds_palet')}"))
    for k in ("codigo_sap", "producto", "formato", "sap_mezcla"):
        if not p.get(k):
            inc.append(dict(tipo="campo_clave_vacio", campo=k, detalle=f"{k} vacío en la ficha"))
    if p.get("sap_mezcla") and not re.fullmatch(r"G\d{6}", p["sap_mezcla"]):
        inc.append(dict(tipo="sap_mezcla_no_es_codigo_G", campo="sap_mezcla", detalle=f"'{p['sap_mezcla']}'"))
    if p.get("codigo_sap") and not re.fullmatch(r"\d{7}", p["codigo_sap"]):
        inc.append(dict(tipo="codigo_sap_formato_raro", campo="codigo_sap", detalle=f"'{p['codigo_sap']}'"))

# Familia DERIVADA de la denominación (reglas por palabra clave; no es un campo del PDF). Orden = prioridad.
REGLAS_FAMILIA = [("Sangría", r"SANGRIA"), ("Tinto de verano", r"TINTO DE VERANO"), ("Tisana", r"TISANA"),
                  ("Té", r"\bTE\b|\bTEA\b|\bCHA\b"), ("Tónica", r"TONICA"), ("Cola", r"\bCOLA\b"),
                  ("Gaseosa", r"GASEOSA|\bGASEO\b"), ("Lima-limón", r"LIMA[ -]LIMON"), ("Naranja", r"NARANJA|\bNAR\b"),
                  ("Limón", r"LIMON|\bLIM\b"), ("Guaraná", r"GUARANA"), ("Isodrink", r"ISODRINK"),
                  ("Bebida ACE", r"BEBIDA ACE"), ("Bebida de fruta sin gas", r"BEBIDA (TROPICAL|DE MANZANA|MULTIFRUTAS|MANDARINA)"),
                  ("Kong Strong", r"^")]  # último recurso solo si la marca es KONG STRONG (ver familia())

def familia(p):
    t = unicodedata.normalize("NFKD", p.get("producto") or "").encode("ascii", "ignore").decode().upper()
    for fam, rx in REGLAS_FAMILIA[:-1]:
        if re.search(rx, t): return fam
    if (p.get("marca") or "").upper() == "KONG STRONG": return "Kong Strong"
    return "Sin clasificar"

def con_gas(p):
    """Derivado: True si el PDF trae algún valor de CO2 en producto terminado."""
    c = p["producto_terminado"].get("co2", {})
    return any(c.get(k) for k in ("std", "max", "min"))

# ----------------------------------------------------------------------------- imágenes
def extrae_imagenes(path, productos, destino, zoom=2.0):
    import pymupdf
    doc = pymupdf.open(path)
    n = 0
    for p in productos:
        if p["fuente"]["pdf"] != path.name or len(p["fuente"]["paginas"]) < 2: continue
        pg = doc[p["fuente"]["paginas"][1] - 1]
        d = destino / p["codigo_sap"]; d.mkdir(parents=True, exist_ok=True)
        rutas = {}
        for k, x0, x1, t, b in IMAGENES_P2:
            if k not in p["imagenes_disponibles"]: continue
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=pymupdf.Rect(x0 + 1, t + 1, x1 - 1, b - 1))
            f = d / f"{k}.jpg"
            pix.save(str(f), jpg_quality=85) if hasattr(pix, "save") else pix.pil_save(str(f))
            rutas[k] = str(f.relative_to(DATOS))
            n += 1
        p["imagenes"] = rutas
    return n

# ----------------------------------------------------------------------------- diferencias
def aplana(d, pref=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            if k in ("incidencias", "fuente", "imagenes"): continue
            out.update(aplana(v, f"{pref}{k}."))
    elif isinstance(d, list):
        out[pref[:-1]] = ", ".join(map(str, d))
    else:
        out[pref[:-1]] = d
    return out

def diferencias(viejos, nuevos):
    va = {p["codigo_sap"]: p for p in viejos}; nu = {p["codigo_sap"]: p for p in nuevos}
    alta = [s for s in nu if s not in va]; baja = [s for s in va if s not in nu]
    cambios = {}
    for s in nu:
        if s in va:
            a, b = aplana(va[s]), aplana(nu[s])
            dif = {k: [a.get(k), b.get(k)] for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)}
            if dif: cambios[s] = dif
    return dict(nuevos=alta, eliminados=baja, modificados=cambios,
                nombres={s: (nu.get(s) or va.get(s)).get("producto") for s in set(alta) | set(baja) | set(cambios)})

def informe_md(dif, fuentes, ahora):
    L = [f"# Cambios en productos terminados · {ahora:%d/%m/%Y %H:%M}", "", "Fuentes: " + ", ".join(fuentes), "",
         f"- Nuevos: {len(dif['nuevos'])}", f"- Eliminados: {len(dif['eliminados'])}", f"- Modificados: {len(dif['modificados'])}", ""]
    for t, lst in (("Nuevos", dif["nuevos"]), ("Eliminados", dif["eliminados"])):
        if lst:
            L += [f"## {t}"] + [f"- {s} · {dif['nombres'].get(s)}" for s in lst] + [""]
    if dif["modificados"]:
        L.append("## Modificados")
        for s, d in dif["modificados"].items():
            L.append(f"### {s} · {dif['nombres'].get(s)}")
            for k, (a, b) in d.items():
                L.append(f"- `{k}`: {a!r} → {b!r}")
            L.append("")
    return "\n".join(L)

# ----------------------------------------------------------------------------- main
def elige_pdfs(args):
    if args.pdf:
        sel = [Path(p).resolve() for p in args.pdf]
    else:
        por_grupo = {}
        for f in sorted(FUENTES.glob("*.pdf")):
            g = grupo_de_nombre(f.name)
            if not g: continue
            clave = (f.name[:6] if re.match(r"\d{6}", f.name) else "", f.stat().st_mtime)
            if g not in por_grupo or clave > por_grupo[g][0]:
                por_grupo[g] = (clave, f)
        sel = [v[1] for v in por_grupo.values()]
    out = []
    for f in sel:
        g = grupo_de_nombre(f.name)
        if not g: sys.exit(f"No sé si '{f.name}' es Asépticos o No Asépticos: el nombre debe contenerlo.")
        out.append((f, g))
    return out

def finaliza(productos):
    """Comprobaciones globales y campos derivados (idéntico para extract.py y actualizar.py)."""
    c = collections.Counter(p["codigo_sap"] for p in productos)
    dups = [s for s, n in c.items() if n > 1]
    for p in productos:
        p["con_gas_derivado"] = con_gas(p)
        p["familia_derivada"] = familia(p)
        controles(p)
        if p["codigo_sap"] in dups:
            p["incidencias"].append(dict(tipo="sap_duplicado", campo="codigo_sap", detalle="el código SAP aparece en más de una ficha"))
        if p["aseptico"] is not None and (p["aseptico"] != (p["grupo_pdf"] == "Asépticos")):
            p["incidencias"].append(dict(tipo="aseptico_incoherente", campo="aseptico",
                                         detalle=f"casilla Aseptico={p['aseptico']} pero está en el PDF {p['grupo_pdf']}"))
    import correcciones   # correcciones manuales con OK de Jorge (ver correcciones.py)
    correcciones.aplicar(productos, correcciones.cargar(DATOS))
    for p in productos: p.setdefault("_geom", {})
    return productos

def extrae(pdfs, previo, parcial=False, log=print):
    """Lee los PDFs [(ruta, grupo)] y devuelve la lista de productos (con '_geom'). Con parcial, conserva del
    JSON previo los productos de los grupos no entregados."""
    productos = []
    for f, g in pdfs:
        ps = parse_pdf(f, g, log=log)
        log(f"  {f.name}: {len(ps)} productos")
        productos += ps
    if parcial:
        grupos = {g for _, g in pdfs}
        productos = [p for p in previo if p["grupo_pdf"] not in grupos] + productos
    return finaliza(productos)

def main():
    global DATOS
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", action="append", help="PDF a procesar (repetible). Por defecto: el más reciente de cada grupo en fuentes/")
    ap.add_argument("--salida", default=str(DATOS))
    ap.add_argument("--sin-imagenes", action="store_true")
    ap.add_argument("--solo-diff", action="store_true", help="solo muestra cambios, no escribe")
    ap.add_argument("--sin-bundle", action="store_true", help="no regenera app-data/datos.enc (paquete cifrado de la app)")
    ap.add_argument("--parcial", action="store_true",
                    help="los PDFs dados sustituyen solo a su grupo; los productos del otro grupo se conservan del JSON actual")
    args = ap.parse_args()
    DATOS = Path(args.salida)
    ahora = dt.datetime.now()
    pdfs = elige_pdfs(args)
    print("PDFs:", *[f"{f.name} → {g}" for f, g in pdfs], sep="\n  ")
    previo_path = DATOS / "productos.json"
    previo_doc = json.loads(previo_path.read_text()) if previo_path.exists() else None
    previo = previo_doc["productos"] if previo_doc else []
    productos = extrae(pdfs, previo, args.parcial)
    dif = diferencias(previo, [{k: v for k, v in p.items() if k != '_geom'} for p in productos])
    print(f"Diferencias vs versión anterior: {len(dif['nuevos'])} nuevos, {len(dif['eliminados'])} eliminados, {len(dif['modificados'])} modificados")
    if args.solo_diff:
        print(informe_md(dif, [f.name for f, _ in pdfs], ahora)); return
    DATOS.mkdir(parents=True, exist_ok=True)
    if not args.sin_imagenes:
        imgdir = DATOS / "imagenes"
        n = 0
        for f, g in pdfs:
            n += extrae_imagenes(f, productos, imgdir)
        print(f"  imágenes recortadas: {n}")
    elif previo:
        old = {p["codigo_sap"]: p.get("imagenes", {}) for p in previo}
        for p in productos: p.setdefault("imagenes", old.get(p["codigo_sap"], {}))
    geometria = {p["codigo_sap"]: p.pop("_geom") for p in productos if "_geom" in p}
    doc = collections.OrderedDict(
        generado=ahora.strftime("%Y-%m-%d %H:%M:%S"),
        fuentes=sorted([{"pdf": f.name, "grupo": g} for f, g in pdfs] +
                       ([x for x in previo_doc.get("fuentes", []) if x["grupo"] not in {g for _, g in pdfs}] if args.parcial and previo_doc else []),
                       key=lambda x: x["pdf"]),
        n_productos=len(productos),
        nota="Valores como TEXTO tal cual aparecen en el PDF. 'con_gas_derivado' se deduce de que haya CO2. "
             "'limites_cliente' casilla_1/casilla_2 no tienen encabezado en el PDF.",
        productos=productos)
    import correcciones
    lista_corr = correcciones.cargar(DATOS)
    if lista_corr:   # viaja cifrada en datos.enc para que el actualizador de la web la vuelva a aplicar
        doc["correcciones"] = lista_corr
        doc.move_to_end("productos")
    previo_bytes = previo_path.read_bytes() if previo_path.exists() else None
    tmp = previo_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    tmp.replace(previo_path)
    (DATOS / "geometria.json").write_text(json.dumps(geometria, ensure_ascii=False))
    # registro de cambios: copia fechada del productos.json anterior + informe .md/.xlsx/.json y datos/cambios/ultimo.json
    # (este último es el que build/bundle.py mete en el paquete de la app como clave 'cambios', vista «Novedades»)
    import cambios as registro_cambios
    carpeta = registro_cambios.registra(DATOS, previo_doc, previo_bytes, doc, dif, ahora)
    print("Cambios →", carpeta or "sin cambios de datos (se conserva el registro anterior)")
    if (BASE / "CONOCIMIENTO.md").exists():   # solo en la carpeta del proyecto, nunca en CI
        import conocimiento
        conocimiento.actualiza(BASE / "CONOCIMIENTO.md", doc)
    if os.environ.get("PT_XLSX", "1") != "0":
        from xlsx import escribe_xlsx
        escribe_xlsx(doc, DATOS / "productos.xlsx", ETIQ_SUPERIOR, ZONAS_P2)
    print("OK →", previo_path)
    if not args.sin_bundle and DATOS.resolve() == (BASE / "datos").resolve():
        import bundle
        bundle.main()   # app-data/datos.enc + formato.json, con verificación de ida y vuelta

if __name__ == "__main__":
    main()
