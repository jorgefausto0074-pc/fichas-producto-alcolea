#!/usr/bin/env python3
"""Comprueba que productos.xlsx dice exactamente lo mismo que productos.json (celda a celda)."""
import json, os, sys
from pathlib import Path
from openpyxl import load_workbook
sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract, xlsx
BASE = Path(os.environ["PT_BASE"]).resolve() if os.environ.get("PT_BASE") else Path(__file__).resolve().parent.parent   # PT_BASE = carpeta de trabajo (CI)
d = json.load(open(BASE / "datos/productos.json")); ps = d["productos"]
wb = load_workbook(BASE / "datos/productos.xlsx", read_only=True)
err = 0; n = 0
def cmp(a, b, where):
    global err, n
    n += 1
    a = "" if a is None else str(a); b = "" if b is None else str(b)
    if a != b:
        err += 1
        if err <= 30: print("DIF", where, repr(a), "≠", repr(b))
# Productos
rows = list(wb["Productos"].iter_rows(values_only=True)); cab = rows[0]; body = rows[1:]
assert len(body) == len(ps), (len(body), len(ps))
idx = {c: i for i, c in enumerate(cab)}
for p, r in zip(ps, body):
    cmp(r[0], p["codigo_sap"], "Productos SAP")
    for k in ["producto", "marca", "formato", "sap_mezcla", "relacion_jarabe", "tipo_palet", "agrupacion", "cajas_palet", "uds_caja", "uds_palet", "peso_preforma_g", "tipo_tapon"]:
        cmp(r[idx[extract.ETIQ_SUPERIOR[k]]], p[k], f"Productos {p['codigo_sap']} {k}")
    for k, e, *_ in extract.ZONAS_P2:
        cmp(r[idx[e]], p["diseno"].get(k), f"Productos {p['codigo_sap']} diseno.{k}")
    cmp(r[idx["Observaciones"]], p["observaciones"], f"Productos {p['codigo_sap']} obs")
# Fisicoquímicos
fq = {}
for r in list(wb["Fisicoquímicos"].iter_rows(values_only=True))[1:]:
    fq[(r[0], r[6], r[4])] = r
nfil = 0
for p in ps:
    for sec, nom in xlsx.SECCIONES:
        for clave, fila in p[sec].items():
            vals = {k: v for k, v in fila.items() if k != "etiqueta"}
            if not vals: continue
            nfil += 1
            r = fq.get((p["codigo_sap"], clave, nom))
            if r is None: err += 1; print("FALTA fila", p["codigo_sap"], sec, clave); continue
            for col, i in (("std", 7), ("max", 8), ("min", 9), ("valor", 10), ("casilla_1", 11), ("casilla_2", 12), ("unidad", 13)):
                cmp(r[i], fila.get(col), f"FQ {p['codigo_sap']} {sec}.{clave}.{col}")
if nfil != len(fq): err += 1; print("Nº filas fisicoquímicos", nfil, "vs", len(fq))
print(f"Celdas comparadas: {n} · diferencias: {err} · filas fisicoquímicas: {len(fq)}")
sys.exit(1 if err else 0)
