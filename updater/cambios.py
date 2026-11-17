#!/usr/bin/env python3
"""
Registro de cambios entre versiones de datos/productos.json (vista «Novedades» de la app).

Formato 'cambios' que va dentro del paquete cifrado (clave de primer nivel del índice, ver bundle.py):
  {"fecha_anterior": str|null, "fecha_actual": str,
   "resumen": {"altas": int, "bajas": int, "modificados": int},
   "altas": [{"sap", "denominacion"}], "bajas": [{"sap", "denominacion"}],
   "modificados": [{"sap", "denominacion", "campos": [{"ruta", "etiqueta", "antes", "despues"}]}]}
  - altas = productos que aparecen ahora y antes no; bajas = estaban y ya no.
  - antes/despues: valor tal cual se extrajo del PDF (texto; null = casilla vacía; true/false en casillas de verificación).
  - Versión inicial: fecha_anterior = null y listas vacías.

Ficheros (datos/cambios/):
  ultimo.json                         el 'cambios' vigente (lo lee bundle.py)
  <AAAAMMDD-HHMMSS>/productos_anterior.json   copia exacta del productos.json sustituido
  <AAAAMMDD-HHMMSS>/cambios.json|.md|.xlsx    informe de esa actualización (+ incidencias nuevas / resueltas)
"""
import collections, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SECCION = {"datos_jarabe": "Datos del jarabe", "producto_terminado": "Producto terminado", "alergenos_claims": "Alérgenos / claims",
           "proceso": "Proceso", "microbiologia": "Microbiología (máximos)", "limites_cliente": "Límites cliente"}
COLUMNA = {"std": "Std.", "max": "Máx.", "min": "Mín.", "valor": "Valor", "unidad": "Unidad",
           "casilla_1": "Casilla 1", "casilla_2": "Casilla 2", "etiqueta": "Rótulo en el PDF"}
EXTRA = {"grupo_pdf": "Grupo (PDF)", "con_gas_derivado": "Con gas (derivado)", "familia_derivada": "Familia (derivada)",
         "observaciones": "Observaciones", "imagenes_disponibles": "Imágenes disponibles (página 2)",
         "codigo_sap": "Código SAP"}


def _etiquetas_base():
    import esquema_app
    e = {k: et for k, et, _ in esquema_app.CAB + esquema_app.ENV + esquema_app.PAL}
    e.update(EXTRA)
    return e, esquema_app.DIS


def etiqueta(ruta, nuevo, viejo):
    """Etiqueta en español de una ruta aplanada ('producto_terminado.brix.max' → 'Producto terminado · BRIX · Máx.')."""
    base, dis = _etiquetas_base()
    partes = ruta.split(".")
    if partes[0] in SECCION and len(partes) == 3:
        sec, fila, col = partes
        rot = None
        for p in (nuevo, viejo):
            if p and fila in p.get(sec, {}):
                rot = p[sec][fila].get("etiqueta"); break
        rot = (rot or fila).strip().rstrip(":").strip()
        return f"{SECCION[sec]} · {rot} · {COLUMNA.get(col, col)}"
    if partes[0] == "diseno" and len(partes) == 2:
        return dis.get(partes[1], partes[1]).split(" (texto;")[0]
    return base.get(ruta, ruta)


def construye(previo_doc, nuevo_doc, dif):
    """Objeto 'cambios' (formato de la app) a partir del resultado de extract.diferencias()."""
    va = {p["codigo_sap"]: p for p in (previo_doc or {}).get("productos", [])}
    nu = {p["codigo_sap"]: p for p in nuevo_doc["productos"]}
    den = lambda s: (nu.get(s) or va.get(s) or {}).get("producto")
    if previo_doc is None:
        return inicial(nuevo_doc)
    altas = [dict(sap=s, denominacion=den(s)) for s in sorted(dif["nuevos"])]
    bajas = [dict(sap=s, denominacion=den(s)) for s in sorted(dif["eliminados"])]
    mods = []
    for s in sorted(dif["modificados"]):
        campos = [dict(ruta=r, etiqueta=etiqueta(r, nu.get(s), va.get(s)), antes=a, despues=b)
                  for r, (a, b) in dif["modificados"][s].items()]
        mods.append(dict(sap=s, denominacion=den(s), campos=campos))
    return collections.OrderedDict(
        fecha_anterior=previo_doc.get("generado"), fecha_actual=nuevo_doc["generado"],
        resumen=dict(altas=len(altas), bajas=len(bajas), modificados=len(mods)),
        altas=altas, bajas=bajas, modificados=mods)


def inicial(nuevo_doc):
    return collections.OrderedDict(fecha_anterior=None, fecha_actual=nuevo_doc["generado"],
                                   resumen=dict(altas=0, bajas=0, modificados=0), altas=[], bajas=[], modificados=[])


def valida(c):
    """Comprueba el formato exacto que espera la app. Lanza AssertionError si no cuadra."""
    assert set(c) == {"fecha_anterior", "fecha_actual", "resumen", "altas", "bajas", "modificados"}, sorted(c)
    assert c["fecha_anterior"] is None or isinstance(c["fecha_anterior"], str)
    assert isinstance(c["fecha_actual"], str)
    assert set(c["resumen"]) == {"altas", "bajas", "modificados"}
    for k in ("altas", "bajas", "modificados"):
        assert isinstance(c[k], list) and c["resumen"][k] == len(c[k]), k
    for x in c["altas"] + c["bajas"]:
        assert set(x) == {"sap", "denominacion"}, x
    for m in c["modificados"]:
        assert set(m) == {"sap", "denominacion", "campos"} and m["campos"], m.get("sap")
        for f in m["campos"]:
            assert set(f) == {"ruta", "etiqueta", "antes", "despues"}, f
    return True


def incidencias_nuevas(previo_doc, nuevo_doc):
    """(nuevas, resueltas): incidencias de datos que aparecen / desaparecen (por SAP, tipo, campo, detalle)."""
    clave = lambda s, i: (s, i["tipo"], i.get("campo"), i["detalle"])
    va = {clave(p["codigo_sap"], i): (p, i) for p in (previo_doc or {}).get("productos", []) for i in p["incidencias"]}
    nu = {clave(p["codigo_sap"], i): (p, i) for p in nuevo_doc["productos"] for i in p["incidencias"]}
    fila = lambda p, i: dict(sap=p["codigo_sap"], denominacion=p["producto"], tipo=i["tipo"], campo=i.get("campo"), detalle=i["detalle"])
    return ([fila(*nu[k]) for k in nu if k not in va], [fila(*va[k]) for k in va if k not in nu])


def _v(x):
    return "(vacío)" if x is None else ("Sí" if x is True else "No" if x is False else f"«{x}»")


def informe_md(c, nuevas, resueltas, fuentes, titulo="Informe de cambios", extra=None):
    L = [f"# {titulo} · Productos terminados Alcolea", "",
         f"- Versión anterior de los datos: {c['fecha_anterior'] or '(ninguna: versión inicial)'}",
         f"- Versión nueva: {c['fecha_actual']}", "- PDFs: " + "; ".join(fuentes), "",
         "| Altas (productos nuevos) | Bajas (ya no están en el PDF) | Productos modificados | Valores modificados | Incidencias nuevas | Incidencias resueltas |",
         "|---|---|---|---|---|---|",
         f"| {c['resumen']['altas']} | {c['resumen']['bajas']} | {c['resumen']['modificados']} | "
         f"{sum(len(m['campos']) for m in c['modificados'])} | {len(nuevas)} | {len(resueltas)} |", ""]
    if extra: L += extra + [""]
    if not (c["altas"] or c["bajas"] or c["modificados"]):
        L += ["**No hay cambios de datos** respecto a la versión anterior.", ""]
    if c["altas"]:
        L += ["## Altas", ""] + [f"- **{x['sap']}** · {x['denominacion']}" for x in c["altas"]] + [""]
    if c["bajas"]:
        L += ["## Bajas", ""] + [f"- **{x['sap']}** · {x['denominacion']}" for x in c["bajas"]] + [""]
    if c["modificados"]:
        L += ["## Modificados (antes → después)", ""]
        for m in c["modificados"]:
            L += [f"### {m['sap']} · {m['denominacion']}", "", "| Campo | Antes | Después |", "|---|---|---|"]
            L += [f"| {f['etiqueta']} | {_v(f['antes'])} | {_v(f['despues'])} |".replace("\n", " ") for f in m["campos"]] + [""]
    if nuevas:
        L += ["## Incidencias nuevas en el PDF (se avisan, no se corrigen)", "", "| SAP | Producto | Tipo | Detalle |", "|---|---|---|---|"]
        L += [f"| {i['sap']} | {i['denominacion']} | {i['tipo']} | {i['detalle']} |".replace("\n", " ") for i in nuevas] + [""]
    if resueltas:
        L += ["## Incidencias que ya no aparecen", "", "| SAP | Producto | Tipo | Detalle |", "|---|---|---|---|"]
        L += [f"| {i['sap']} | {i['denominacion']} | {i['tipo']} | {i['detalle']} |".replace("\n", " ") for i in resueltas] + [""]
    return "\n".join(L)


def informe_xlsx(c, nuevas, resueltas, ruta):
    from openpyxl import Workbook
    from xlsx import hoja, arregla_estilos
    wb = Workbook(); wb.remove(wb.active)
    hoja(wb, "Resumen", ["Concepto", "Valor"], [
        ["Versión anterior", c["fecha_anterior"] or "(versión inicial)"], ["Versión nueva", c["fecha_actual"]],
        ["Altas", c["resumen"]["altas"]], ["Bajas", c["resumen"]["bajas"]], ["Productos modificados", c["resumen"]["modificados"]],
        ["Valores modificados", sum(len(m["campos"]) for m in c["modificados"])],
        ["Incidencias nuevas", len(nuevas)], ["Incidencias resueltas", len(resueltas)]])
    hoja(wb, "Altas", ["Código SAP", "Denominación"], [[x["sap"], x["denominacion"]] for x in c["altas"]])
    hoja(wb, "Bajas", ["Código SAP", "Denominación"], [[x["sap"], x["denominacion"]] for x in c["bajas"]])
    hoja(wb, "Modificados", ["Código SAP", "Denominación", "Campo", "Ruta", "Antes", "Después"],
         [[m["sap"], m["denominacion"], f["etiqueta"], f["ruta"], _txt(f["antes"]), _txt(f["despues"])] for m in c["modificados"] for f in m["campos"]])
    hoja(wb, "Incidencias nuevas", ["Código SAP", "Denominación", "Tipo", "Campo", "Detalle"],
         [[i["sap"], i["denominacion"], i["tipo"], i["campo"], i["detalle"]] for i in nuevas])
    hoja(wb, "Incidencias resueltas", ["Código SAP", "Denominación", "Tipo", "Campo", "Detalle"],
         [[i["sap"], i["denominacion"], i["tipo"], i["campo"], i["detalle"]] for i in resueltas])
    for ws in wb.worksheets:
        for col, w in zip("ABCDEF", (14, 46, 46, 34, 22, 22)): ws.column_dimensions[col].width = w
    wb.save(ruta)
    arregla_estilos(ruta)   # orden de hijos de <font> para 0 errores en Open XML SDK


def _txt(x):
    return None if x is None else ("Sí" if x is True else "No" if x is False else str(x))


def escribe_informe(carpeta, c, previo_doc, nuevo_doc, fuentes, titulo="Informe de cambios", extra=None):
    carpeta = Path(carpeta); carpeta.mkdir(parents=True, exist_ok=True)
    nuevas, resueltas = incidencias_nuevas(previo_doc, nuevo_doc) if previo_doc else ([], [])
    (carpeta / "cambios.json").write_text(json.dumps(c, ensure_ascii=False, indent=1))
    (carpeta / "cambios.md").write_text(informe_md(c, nuevas, resueltas, fuentes, titulo, extra))
    if os.environ.get("PT_XLSX", "1") != "0":
        informe_xlsx(c, nuevas, resueltas, carpeta / "cambios.xlsx")
    return nuevas, resueltas


def registra(datos, previo_doc, previo_bytes, nuevo_doc, dif, ahora):
    """Llamado por extract.py tras escribir el nuevo productos.json. Devuelve la carpeta fechada o None si no hubo cambios."""
    datos = Path(datos); dc = datos / "cambios"; dc.mkdir(parents=True, exist_ok=True)
    ultimo = dc / "ultimo.json"
    hay = previo_doc is not None and bool(dif["nuevos"] or dif["eliminados"] or dif["modificados"])
    if not hay:
        # sin cambios de datos: se conserva el registro vigente (o se crea el de versión inicial)
        if not ultimo.exists():
            c = inicial(nuevo_doc); valida(c)
            ultimo.write_text(json.dumps(c, ensure_ascii=False, indent=1))
        return None
    c = construye(previo_doc, nuevo_doc, dif); valida(c)
    carpeta = dc / f"{ahora:%Y%m%d-%H%M%S}"
    carpeta.mkdir(parents=True, exist_ok=False)
    (carpeta / "productos_anterior.json").write_bytes(previo_bytes)
    escribe_informe(carpeta, c, previo_doc, nuevo_doc, [f["pdf"] for f in nuevo_doc.get("fuentes", [])])
    tmp = ultimo.with_suffix(".tmp"); tmp.write_text(json.dumps(c, ensure_ascii=False, indent=1)); tmp.replace(ultimo)
    return carpeta


def lee_ultimo(datos, doc):
    """'cambios' vigente para el paquete; si no hay registro, el de versión inicial."""
    f = Path(datos) / "cambios" / "ultimo.json"
    c = json.loads(f.read_text()) if f.exists() else inicial(doc)
    valida(c)
    return c
