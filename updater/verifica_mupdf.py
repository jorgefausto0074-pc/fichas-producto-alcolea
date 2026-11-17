#!/usr/bin/env python3
"""Verificación independiente nº 1 (motor MuPDF, distinto de pdfplumber):
para cada página, el multiconjunto de palabras NO negritas del PDF debe coincidir exactamente
con las palabras de los valores guardados en productos.json (nada perdido, nada inventado)."""
import json, os, sys, collections, re
from pathlib import Path
import pymupdf
BASE = Path(os.environ["PT_BASE"]).resolve() if os.environ.get("PT_BASE") else Path(__file__).resolve().parent.parent   # PT_BASE = carpeta de trabajo (CI)
d = json.load(open(BASE / "datos/productos.json"))
FIJO_SPAN = "(RESTO DE VALORES DENTRO DE MARGENES)"
def toks(s): return re.sub(r"\s+", " ", s.replace("\t", " ")).split()
def hoja_tokens(v, out):
    if isinstance(v, dict):
        for k, x in v.items():
            if k != "etiqueta": hoja_tokens(x, out)
    elif isinstance(v, str): out.extend(toks(v))
docs = {}
fallos = 0; resumen = collections.Counter()
informe = []
for p in d["productos"]:
    f = p["fuente"]["pdf"]
    if not (BASE / "fuentes" / f).exists():   # CI con un solo PDF: el otro grupo ya se verificó al publicarse
        resumen["omitidas_sin_pdf"] += 1; continue
    doc = docs.setdefault(f, pymupdf.open(BASE / "fuentes" / f))
    cab = [p["codigo_sap"], p["n_pagina_ficha"], p["fecha"], p["edicion"]]
    j1, j2 = [], []
    for k, v in p.items():
        if k in ("diseno", "fuente", "incidencias", "imagenes", "imagenes_disponibles", "grupo_pdf",
                 "aseptico", "marcado_e", "con_gas_derivado", "familia_derivada"): continue
        hoja_tokens(v, j1)
    hoja_tokens(p["diseno"], j2); j2 += [t for c in cab if c for t in toks(c)]
    for idx, jt in zip(p["fuente"]["paginas"], (j1, j2)):
        pg = doc[idx - 1]
        pdf_t = []
        for b in pg.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    if "Bold" in s["font"] or s["flags"] & 16: continue
                    if s["text"].strip() == FIJO_SPAN: continue
                    pdf_t += toks(s["text"])
        # el texto de control de Access de t.PASTER no se guarda como valor
        tp = any(i["tipo"] == "error_plantilla_access" for i in p["incidencias"])
        pdf_t = [t for t in pdf_t if not (tp and ("Paster" in t or t == "r_Min"))]
        a, b = collections.Counter(pdf_t), collections.Counter(jt)
        falta, sobra = a - b, b - a
        if falta or sobra:
            fallos += 1
            informe.append(f"{p['codigo_sap']} pág {idx}: falta en JSON {dict(falta)} · sobra en JSON {dict(sobra)}")
        resumen["paginas"] += 1; resumen["palabras_pdf"] += sum(a.values())
print(f"Páginas comprobadas: {resumen['paginas']} · palabras de valor en PDF: {resumen['palabras_pdf']} · páginas con diferencias: {fallos}"
      + (f" · fichas sin PDF disponible (no comprobadas): {resumen['omitidas_sin_pdf']}" if resumen['omitidas_sin_pdf'] else ""))
if resumen["paginas"] == 0: print("ninguna página comprobada"); sys.exit(1)
for l in informe: print("  ", l)
sys.exit(1 if fallos else 0)
