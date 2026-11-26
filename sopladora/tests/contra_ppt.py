#!/usr/bin/env python3
"""Lee el PowerPoint (XML) y lo compara con botellas.json. No imprime los pesos si todo cuadra."""
import json, re, sys, zipfile
from fractions import Fraction as F
from xml.etree import ElementTree as ET

NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
A_TBL = "{http://schemas.openxmlformats.org/drawingml/2006/main}tbl"

def fr(t):
    return F(str(t).strip().replace(",", "."))

def tablas(z, n):
    x = ET.fromstring(z.read(f"ppt/slides/slide{n}.xml"))
    out = []
    for tbl in x.iter(A_TBL):
        rows = []
        for tr in tbl.findall("a:tr", NS):
            rows.append(["".join(tc.itertext()).strip() for tc in tr.findall("a:tc", NS)])
        out.append(rows)
    return out

def main():
    ppt, datos = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(ppt)
    doc = json.load(open(datos, encoding="utf-8"))
    fichas = {f["ficha_codigo"] + "|" + f["gas"]: f for b in doc["botellas"] for f in b["fichas"]}
    leidas = {}
    for n in range(4, 18):
        if n == 10:
            continue
        gas = "con_gas" if n < 10 else "sin_gas"
        for rows in tablas(z, n):
            if not rows or not rows[0] or rows[0][0] != "Zona":
                continue
            nc = (len(rows[0]) - 1) // 2
            for k in range(nc):
                code = rows[0][1 + 2 * k].strip()
                if not code:
                    continue
                zs, tot = [], None
                for r in rows[2:]:
                    celda = r[1 + 2 * k].replace("\u2013", "–").strip()
                    trozos = re.split(r"\s*[–\-]\s*", celda)
                    a, b = sorted([fr(trozos[0]), fr(trozos[1])])
                    med = fr(r[2 + 2 * k])
                    if r[0] == "Peso total":
                        tot = (a, b, med)
                    else:
                        zs.append((r[0], a, b, med))
                leidas[code + "|" + gas] = (zs, tot)
    fallos = []
    pruebas = 0
    def chk(ok, msg):
        nonlocal pruebas
        pruebas += 1
        if not ok:
            fallos.append(msg)
    chk(len(leidas) == 14, f"fichas leídas del PPT: {len(leidas)}")
    chk(set(leidas) == set(fichas), "conjunto distinto: " + str(set(leidas) ^ set(fichas)))
    for key, (zs, tot) in leidas.items():
        f = fichas.get(key)
        if not f:
            chk(False, "falta en JSON " + key)
            continue
        chk(len(zs) == f["n_zonas"], key + " nº zonas")
        for (nm, a, b, m), jz in zip(zs, f["zonas"]):
            def cents(x):
                return round(float(x) * 100)
            chk(jz["nombre"] == nm and cents(jz["min"]) == cents(a) and cents(jz["max"]) == cents(b) and cents(jz["medio"]) == cents(m),
                f"{key}/{nm}")
        chk(tuple(round(x, 2) for x in (f["peso_total_g"]["min"], f["peso_total_g"]["medio"], f["peso_total_g"]["max"]))
            == (float(tot[0]), float(tot[2]), float(tot[1])),
            key + " total")
    print(json.dumps({"total": pruebas, "fallos": len(fallos), "lista_fallos": fallos}, ensure_ascii=False))
    return 1 if fallos else 0

if __name__ == "__main__":
    sys.exit(main())
