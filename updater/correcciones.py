"""Correcciones manuales de valores del PDF, SOLO con OK expreso de Jorge.

Fuente: datos/correcciones.json (carpeta privada del proyecto). Copia dentro de productos.json (clave
'correcciones'), así viaja cifrada en datos.enc y el actualizador de la web (CI) la recupera al descifrar
el paquete publicado. Nada en claro en el repo.

Cada entrada: {"sap", "campo" (ruta con puntos, p. ej. "diseno.botella_tipo"), "valor_pdf", "valor_corregido",
"fecha", "ok"}. Se aplica SOLO si el valor leído del PDF es exactamente 'valor_pdf' (si el PDF cambia, no se toca
y la corrección queda inactiva). Cada aplicación deja una incidencia tipo 'corregida_con_ok' en la ficha, con
el valor del PDF y el corregido, para que se vea en la app y en la hoja Incidencias del Excel.
"""
import json
from pathlib import Path

TIPO = "corregida_con_ok"


def cargar(datos):
    datos = Path(datos)
    f = datos / "correcciones.json"
    if f.exists():
        return json.loads(f.read_text())["correcciones"]
    p = datos / "productos.json"
    if p.exists():
        return json.loads(p.read_text()).get("correcciones", [])
    return []


def _get(p, ruta):
    o = p
    *pre, k = ruta.split(".")
    for x in pre:
        o = o.get(x) or {}
    return o, k


def aplicar(productos, lista):
    """Idempotente. Devuelve el nº de fichas con la corrección activa."""
    por_sap = {}
    for c in lista:
        por_sap.setdefault(c["sap"], []).append(c)
    n = 0
    for p in productos:
        for c in por_sap.get(p["codigo_sap"], []):
            o, k = _get(p, c["campo"])
            ya = any(i.get("tipo") == TIPO and i.get("campo") == c["campo"] for i in p["incidencias"])
            if o.get(k) == c["valor_pdf"]:
                o[k] = c["valor_corregido"]
            elif not (o.get(k) == c["valor_corregido"] and ya):
                continue   # el PDF ya no trae el valor esperado: no se toca
            if not ya:
                p["incidencias"].append(dict(
                    tipo=TIPO, campo=c["campo"],
                    detalle=f"corregida con OK: el PDF dice «{c['valor_pdf']}» y se muestra «{c['valor_corregido']}» ({c['ok']})",
                    valor_pdf=c["valor_pdf"], valor_corregido=c["valor_corregido"]))
            n += 1
    return n


def revertir(p):
    """Copia de la ficha con los valores tal cual vienen en el PDF (para las verificaciones PDF = JSON)."""
    q = json.loads(json.dumps(p))
    for i in q.get("incidencias", []):
        if i.get("tipo") == TIPO:
            o, k = _get(q, i["campo"])
            if o.get(k) == i["valor_corregido"]:
                o[k] = i["valor_pdf"]
    return q
