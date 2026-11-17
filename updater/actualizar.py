#!/usr/bin/env python3
"""
ACTUALIZAR la app «Fichas de producto Alcolea» con PDFs nuevos (Informe Alcolea Asépticos / No Asépticos).

  build/.venv/bin/python build/actualizar.py revisar  PDF [PDF]   1) analiza los PDFs y saca el informe de cambios.
                                                                     No modifica nada (deja todo en actualizacion/pendiente/).
  build/.venv/bin/python build/actualizar.py aplicar               2) SOLO tras el OK de Jorge: regenera productos.json,
                                                                     productos.xlsx, imágenes, datos.enc + formato.json (con
                                                                     'cambios'), verifica todo y deja publicar/ listo.
  build/.venv/bin/python build/actualizar.py verificar-publicado [--esperar 900]
                                                                  3) tras subir publicar/ a GitHub: comprueba la web real.
  build/.venv/bin/python build/actualizar.py estado              versión actual, revisión pendiente y versión publicada.
  build/.venv/bin/python build/actualizar.py publicar [--mensaje "…"]   solo si 'gh' está autenticado en la máquina (hoy NO):
                                                                     un commit en main con datos.enc + formato.json y verificación.

- Vale con uno solo de los dos PDFs: el otro grupo se conserva tal cual.
- El grupo (asépticos / no asépticos) se deduce del CONTENIDO (casilla Aseptico + CO2), no solo del nombre del fichero.
- Si el PDF no tiene el formato de ficha conocido, se rechaza con el motivo.
- 'revisar' sin PDFs vuelve a leer los PDFs vigentes de fuentes/ (sirve para regenerar sin cambios).
Guía completa: GUIA_ACTUALIZACION.md.
"""
import argparse, collections, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys, tarfile, tempfile, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
BASE = Path(os.environ["PT_BASE"]).resolve() if os.environ.get("PT_BASE") else HERE.parent   # PT_BASE = carpeta de trabajo (CI)
FUENTES, DATOS, APP = BASE / "fuentes", BASE / "datos", BASE / "app-data"
ACT = BASE / "actualizacion"
PEND, APLICADAS, PUBLICAR = ACT / "pendiente", ACT / "aplicadas", BASE / "publicar"
URL_APP = "https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/"
GRUPOS = {"Asépticos": "Asépticos", "No asépticos": "No Asépticos"}   # grupo → palabra en el nombre del fichero
OOXMLVAL = Path(os.environ.get("OOXMLVAL", "/nonexistent/ooxmlval.dll"))   # validador Open XML SDK (opcional)
DOTNET = Path(os.environ.get("DOTNET", str(Path.home() / ".dotnet" / "dotnet")))


class Rechazo(Exception):
    pass


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()


def env_node():
    import bundle
    e = dict(os.environ); e["PT_PASSWORD"] = bundle.contrasena()
    return e


# ----------------------------------------------------------------------------- reconocimiento del PDF
def identifica(pdf):
    """Lee el PDF, comprueba que es un informe de fichas de Access y deduce el grupo por el contenido."""
    import extract, pdfplumber
    pdf = Path(pdf)
    if not pdf.exists(): raise Rechazo(f"No existe: {pdf}")
    with open(pdf, "rb") as f:
        if f.read(5) != b"%PDF-": raise Rechazo(f"«{pdf.name}» no es un PDF.")
    try:
        with pdfplumber.open(pdf) as d: n_pag = len(d.pages)
    except Exception as e:
        raise Rechazo(f"«{pdf.name}» no se puede abrir como PDF: {e}")
    avisos_parse = []
    ps = extract.parse_pdf(pdf, None, log=avisos_parse.append)
    if not ps:
        raise Rechazo(f"«{pdf.name}»: formato NO reconocido. No hay ninguna página de ficha técnica "
                      "(se buscan las páginas con «DATOS DEL JARABE» y «Diseño Botella»). No se procesa.")
    omitidas = len(avisos_parse)
    sin_p2 = sum(1 for p in ps if len(p["fuente"]["paginas"]) < 2)
    sap_raros = [p["codigo_sap"] for p in ps if not re.fullmatch(r"\d{7}", p["codigo_sap"] or "")]
    problemas = []
    if omitidas > 0.1 * n_pag: problemas.append(f"{omitidas} de {n_pag} páginas no son de ficha")
    if sin_p2 > 0.1 * len(ps): problemas.append(f"{sin_p2} de {len(ps)} fichas sin página 2")
    if len(sap_raros) > 0.1 * len(ps): problemas.append(f"{len(sap_raros)} de {len(ps)} fichas sin código SAP de 7 dígitos")
    if problemas:
        raise Rechazo(f"«{pdf.name}»: la maqueta no coincide con la conocida ({'; '.join(problemas)}). "
                      "Puede que Access haya cambiado el informe: hay que revisar build/extract.py antes de usarlo.")
    asep = sum(1 for p in ps if p["aseptico"] is True and not extract.con_gas(p))
    noasep = sum(1 for p in ps if p["aseptico"] is False and extract.con_gas(p))
    if asep >= 0.9 * len(ps): grupo = "Asépticos"
    elif noasep >= 0.9 * len(ps): grupo = "No asépticos"
    else:
        raise Rechazo(f"«{pdf.name}»: no se puede saber si es de asépticos o de no asépticos "
                      f"({asep} fichas asépticas sin CO2, {noasep} no asépticas con CO2, de {len(ps)}). ¿Mezcla los dos grupos?")
    por_nombre = extract.grupo_de_nombre(pdf.name)
    if por_nombre and por_nombre != grupo:
        raise Rechazo(f"«{pdf.name}»: el nombre dice «{por_nombre}» pero el contenido es de «{grupo}». No se procesa.")
    avisos = [f"«{pdf.name}»: {a.strip()}" for a in avisos_parse]
    if sin_p2: avisos.append(f"«{pdf.name}»: {sin_p2} fichas sin página 2")
    if sap_raros: avisos.append(f"«{pdf.name}»: códigos SAP con formato raro: {', '.join(map(str, sap_raros))}")
    return dict(grupo=grupo, paginas=n_pag, productos=ps, avisos=avisos)


def nombre_destino(pdf, grupo, sha):
    """Nombre fechado con el grupo (extract.py deduce el grupo del nombre). Nunca pisa un fichero distinto."""
    import extract
    n = Path(pdf).name
    if not (re.match(r"\d{6} ", n) and extract.grupo_de_nombre(n) == grupo):
        n = f"{dt.date.today():%y%m%d} Informe Alcolea {GRUPOS[grupo]}.pdf"
    base, i = n[:-4], 2
    while any((d / n).exists() and sha256(d / n) != sha for d in (FUENTES, FUENTES / "anteriores")):
        n = f"{base} ({i}).pdf"; i += 1
    return n


def vigentes():
    """PDF vigente de cada grupo en fuentes/ (el que usa extract.py por defecto)."""
    import extract
    return {g: f for f, g in extract.elige_pdfs(argparse.Namespace(pdf=None))}


# ----------------------------------------------------------------------------- revisar
def revisar(pdfs):
    import extract, cambios
    t0 = time.time()
    ahora = dt.datetime.now()
    act = vigentes()
    if not pdfs:
        pdfs = [act[g] for g in GRUPOS if g in act]
        print("Sin PDFs nuevos: se vuelven a leer los vigentes de fuentes/.")
    entradas = []
    for pdf in pdfs:
        print(f"Leyendo «{Path(pdf).name}»…", flush=True)
        r = identifica(pdf)
        r["ruta"] = Path(pdf).resolve(); r["sha256"] = sha256(pdf)
        entradas.append(r)
        print(f"  → {r['grupo']}: {len(r['productos'])} fichas, {r['paginas']} páginas")
    grupos = [e["grupo"] for e in entradas]
    dup = [g for g, n in collections.Counter(grupos).items() if n > 1]
    if dup: raise Rechazo(f"Se han dado {len(grupos)} PDFs del mismo grupo ({', '.join(dup)}). Mandar uno por grupo.")
    previo_path = DATOS / "productos.json"
    previo_bytes = previo_path.read_bytes()
    previo_doc = json.loads(previo_bytes)
    previo = previo_doc["productos"]
    # nueva colección: grupos entregados (del PDF) + resto (del JSON actual)
    if PEND.exists():   # una revisión anterior sin aplicar se archiva, no se borra
        (ACT / "descartadas").mkdir(parents=True, exist_ok=True)
        shutil.move(str(PEND), str(ACT / "descartadas" / f"{ahora:%Y%m%d-%H%M%S}"))
    (PEND / "pdfs").mkdir(parents=True)
    nuevos, info_pdfs, avisos = [], [], []
    for e in entradas:
        g = e["grupo"]
        vig = act.get(g)
        if vig and sha256(vig) == e["sha256"]:
            destino, copiado = vig.name, False
            e["efectivo"] = vig
        else:
            destino, copiado = nombre_destino(e["ruta"], g, e["sha256"]), True
            shutil.copy2(e["ruta"], PEND / "pdfs" / destino)
            e["efectivo"] = PEND / "pdfs" / destino
        for p in e["productos"]:
            p["grupo_pdf"] = g; p["fuente"]["pdf"] = destino
        nuevos += e["productos"]
        avisos += e["avisos"]
        n_ant = sum(1 for p in previo if p["grupo_pdf"] == g)
        if n_ant and len(e["productos"]) < 0.5 * n_ant:
            avisos.append(f"OJO: el PDF de {g} trae {len(e['productos'])} fichas y ahora hay {n_ant}. "
                          "¿Es un PDF parcial? Si se aplica, las que faltan saldrán como BAJAS.")
        info_pdfs.append(dict(original=str(e["ruta"]), nombre_original=e["ruta"].name, destino=destino, grupo=g,
                              sha256=e["sha256"], paginas=e["paginas"], fichas=len(e["productos"]), copiado=copiado,
                              sustituye=vig.name if vig and copiado else None))
    entregados = {e["grupo"] for e in entradas}
    nuevos = [p for p in previo if p["grupo_pdf"] not in entregados] + nuevos
    extract.finaliza(nuevos)
    # imágenes de la página 2 (solo para comparar; no se tocan las de datos/)
    extract.DATOS = PEND
    for e in entradas:
        extract.extrae_imagenes(e["efectivo"], [p for p in nuevos if p["grupo_pdf"] == e["grupo"]], PEND / "imagenes")
    img_cambiadas = []
    va = {p["codigo_sap"]: p for p in previo}
    for p in nuevos:
        if p["grupo_pdf"] not in entregados or p["codigo_sap"] not in va: continue
        viejas = va[p["codigo_sap"]].get("imagenes", {})
        for cas in sorted(set(viejas) | set(p.get("imagenes", {}))):
            a = DATOS / viejas[cas] if cas in viejas else None
            b = PEND / p["imagenes"][cas] if cas in p.get("imagenes", {}) else None
            if not (a and b and a.exists() and sha256(a) == sha256(b)):
                img_cambiadas.append(f"{p['codigo_sap']} · {cas}")
    limpios = [{k: v for k, v in p.items() if k != "_geom"} for p in nuevos]
    dif = extract.diferencias(previo, limpios)
    fuentes_prev = {x["grupo"]: x["pdf"] for x in previo_doc.get("fuentes", [])}
    fuentes = {}
    for g in GRUPOS:
        if g in entregados: fuentes[g] = next(i["destino"] for i in info_pdfs if i["grupo"] == g)
        elif g in act: fuentes[g] = act[g].name
        elif g in fuentes_prev: fuentes[g] = fuentes_prev[g]
    nuevo_doc = dict(generado=ahora.strftime("%Y-%m-%d %H:%M:%S"), fuentes=[{"pdf": f, "grupo": g} for g, f in fuentes.items()], productos=limpios)
    c = cambios.construye(previo_doc, nuevo_doc, dif)
    extra = ["## PDFs recibidos", ""] + [
        f"- «{i['nombre_original']}» → **{i['grupo']}**, {i['fichas']} fichas ({i['paginas']} págs.). "
        + (f"Sustituirá a «{i['sustituye']}» y se guardará como «{i['destino']}»." if i["copiado"] else "Es el mismo PDF que el vigente (sin cambios de fichero).")
        for i in info_pdfs]
    for g in GRUPOS:
        if g not in entregados and g in fuentes: extra.append(f"- {g}: no se ha mandado PDF; se conservan las fichas actuales («{fuentes[g]}»).")
    extra += ["", f"Total de fichas tras aplicar: **{len(nuevos)}** (ahora {len(previo)})."]
    if img_cambiadas:
        extra += ["", f"Imágenes de la página 2 que cambian en fichas existentes ({len(img_cambiadas)}): " + ", ".join(img_cambiadas)]
    if avisos: extra += ["", "### Avisos", ""] + [f"- {a}" for a in avisos]
    nuevas, resueltas = cambios.escribe_informe(PEND, c, previo_doc, nuevo_doc, list(fuentes.values()),
                                                 titulo="Revisión pendiente de aprobar", extra=extra)
    (PEND / "incidencias.json").write_text(json.dumps(dict(nuevas=nuevas, resueltas=resueltas), ensure_ascii=False, indent=1))
    rev = dict(creado=ahora.isoformat(timespec="seconds"), base_sha256=hashlib.sha256(previo_bytes).hexdigest(),
               pdfs=info_pdfs, grupos_conservados=[g for g in GRUPOS if g not in entregados], total_fichas=len(nuevos),
               resumen=c["resumen"], valores_modificados=sum(len(m["campos"]) for m in c["modificados"]),
               incidencias_nuevas=len(nuevas), incidencias_resueltas=len(resueltas), imagenes_cambiadas=img_cambiadas,
               avisos=avisos, segundos=round(time.time() - t0, 1))
    (PEND / "revision.json").write_text(json.dumps(rev, ensure_ascii=False, indent=1))
    shutil.rmtree(PEND / "imagenes", ignore_errors=True)
    print((PEND / "cambios.md").read_text())
    print(f"\nInforme: {PEND/'cambios.md'} (+ cambios.xlsx). Tiempo: {rev['segundos']} s.")
    print("NADA se ha modificado. Para aplicarlo (solo con el OK de Jorge): build/.venv/bin/python build/actualizar.py aplicar")
    return rev


# ----------------------------------------------------------------------------- aplicar
FICHEROS_RESPALDO = ["datos/productos.json", "datos/productos.xlsx", "datos/geometria.json", "datos/cambios/ultimo.json",
                     "app-data/datos.enc", "app-data/formato.json", "app-data/ESQUEMA.md", "CONOCIMIENTO.md"]


def respalda(dest):
    dest.mkdir(parents=True)
    for r in FICHEROS_RESPALDO:
        if (BASE / r).exists():
            (dest / r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(BASE / r, dest / r)
    with tarfile.open(dest / "imagenes.tar", "w") as t: t.add(DATOS / "imagenes", arcname="imagenes")


def restaura(orig):
    for r in FICHEROS_RESPALDO:
        if (orig / r).exists(): shutil.copy2(orig / r, BASE / r)
        elif (BASE / r).exists(): (BASE / r).unlink()
    shutil.rmtree(DATOS / "imagenes", ignore_errors=True)
    with tarfile.open(orig / "imagenes.tar") as t: t.extractall(DATOS, filter="data")


def ejecuta(cmd, log, env=None):
    r = subprocess.run(cmd, cwd=BASE, capture_output=True, text=True, env=env)
    with open(log, "a") as f: f.write(f"$ {' '.join(map(str, cmd))}\n{r.stdout}{r.stderr}\n[código {r.returncode}]\n\n")
    return r


def aplicar():
    import extract, cambios
    t0 = time.time()
    if not (PEND / "revision.json").exists():
        raise Rechazo("No hay ninguna revisión pendiente. Primero: actualizar.py revisar <PDFs>")
    rev = json.loads((PEND / "revision.json").read_text())
    previo_bytes = (DATOS / "productos.json").read_bytes()
    if hashlib.sha256(previo_bytes).hexdigest() != rev["base_sha256"]:
        raise Rechazo("productos.json ha cambiado desde la revisión. Repetir 'revisar' antes de aplicar.")
    ahora = dt.datetime.now()
    sello = f"{ahora:%Y%m%d-%H%M%S}"
    dest = APLICADAS / sello; dest.mkdir(parents=True)
    log = dest / "aplicar.log"
    print("Respaldo previo…", flush=True)
    respaldo = ACT / "respaldos" / sello
    respalda(respaldo)
    movidos = []
    try:
        # 1. PDFs a fuentes/ (los sustituidos van a fuentes/anteriores/)
        (FUENTES / "anteriores").mkdir(exist_ok=True)
        for i in rev["pdfs"]:
            if not i["copiado"]: continue
            for f in FUENTES.glob("*.pdf"):
                if extract.grupo_de_nombre(f.name) == i["grupo"]:
                    shutil.move(str(f), str(FUENTES / "anteriores" / f.name)); movidos.append((FUENTES / "anteriores" / f.name, f))
            src = PEND / "pdfs" / i["destino"]
            if sha256(src) != i["sha256"]: raise Rechazo(f"El PDF pendiente «{i['destino']}» ha cambiado desde la revisión.")
            shutil.move(str(src), str(FUENTES / i["destino"])); movidos.append((FUENTES / i["destino"], src))
        act = vigentes()
        for i in rev["pdfs"]:
            assert act[i["grupo"]].name == i["destino"], (i["grupo"], act[i["grupo"]].name)
        # 2. extracción completa + xlsx + imágenes + registro de cambios + paquete cifrado (bundle.py verifica ida y vuelta)
        print("Extrayendo y regenerando (≈1,5 min)…", flush=True)
        # --parcial: solo se releen los grupos entregados; el otro se conserva del JSON (igual que en 'revisar')
        cmd = [sys.executable, HERE / "extract.py", "--parcial"]
        for g, f in act.items():   # mismo orden que extract.py por defecto (orden de nombre)
            if any(i["grupo"] == g for i in rev["pdfs"]): cmd += ["--pdf", f]
        r = ejecuta(cmd, log)
        print(r.stdout[-2500:])
        if r.returncode: raise Rechazo(f"extract.py falló:\n{r.stderr[-3000:]}")
        # 3. ¿se ha aplicado exactamente lo revisado?
        nuevo_doc = json.loads((DATOS / "productos.json").read_text())
        previo_doc = json.loads(previo_bytes)
        dif = extract.diferencias(previo_doc["productos"], nuevo_doc["productos"])
        c = cambios.construye(previo_doc, nuevo_doc, dif)
        c_rev = json.loads((PEND / "cambios.json").read_text())
        for k in ("altas", "bajas", "modificados"):
            if c[k] != c_rev[k]: raise Rechazo(f"Lo aplicado no coincide con lo revisado ({k}). Se deshace.")
        ultimo = json.loads((DATOS / "cambios" / "ultimo.json").read_text())
        hubo = bool(c["altas"] or c["bajas"] or c["modificados"])
        if hubo and ultimo["fecha_actual"] != nuevo_doc["generado"]: raise Rechazo("datos/cambios/ultimo.json no se ha actualizado.")
        # 4. verificaciones
        comprobaciones = {}
        r = ejecuta([sys.executable, HERE / "verifica_mupdf.py"], log)   # 2º motor (MuPDF): nada perdido, nada inventado
        comprobaciones["PDF = JSON con MuPDF (palabra a palabra)"] = (r.returncode == 0, (r.stdout.strip().splitlines() or [r.stderr[-300:]])[0])
        if os.environ.get("PT_XLSX", "1") != "0":
            r = ejecuta([sys.executable, HERE / "verifica_xlsx.py"], log)
            comprobaciones["xlsx = json (celda a celda)"] = (r.returncode == 0, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
            xl = [DATOS / "productos.xlsx"] + ([max((DATOS / "cambios").glob("2*/cambios.xlsx"))] if hubo else [])
            if DOTNET.exists() and OOXMLVAL.exists():
                r = ejecuta([DOTNET, OOXMLVAL, *xl], log)
                comprobaciones["Open XML SDK"] = (r.returncode == 0, " · ".join(l for l in r.stdout.splitlines() if "errors" in l))
            else:
                print("  [omitido] Open XML SDK: validador no disponible (variables DOTNET / OOXMLVAL)")
        r = ejecuta(["node", HERE / "verifica_paquete.mjs", APP, HERE / "descifrar-referencia.mjs"], log, env=env_node())
        try: vp = json.loads(r.stdout)
        except Exception: vp = {"ok": False, "errores": [r.stderr[-500:]]}
        comprobaciones["descifrado con node + descifrar-referencia.mjs"] = (vp.get("ok", False),
            f"{vp.get('productos')} productos, {vp.get('imagenes_unicas')} imágenes únicas, cambios {vp.get('cambios', {}) and vp['cambios'].get('resumen')}, {vp.get('ms_descifrado')} ms")
        formato = json.loads((APP / "formato.json").read_text())
        n_ok = (formato["recuentos"]["productos"] == len(nuevo_doc["productos"]) == rev["total_fichas"] == vp.get("productos"))
        comprobaciones["recuentos (json = formato = revisión = paquete)"] = (n_ok, f"{len(nuevo_doc['productos'])} fichas; esperadas {rev['total_fichas']}")
        malas = {k: v for k, v in comprobaciones.items() if not v[0]}
        for k, (ok, det) in comprobaciones.items(): print(f"  [{'OK' if ok else 'FALLO'}] {k}: {det}")
        if malas: raise Rechazo("Fallan comprobaciones: " + ", ".join(malas))
    except BaseException as e:
        print(f"\n✗ ERROR al aplicar: {e}\nSe restaura el estado anterior desde {respaldo}…")
        restaura(respaldo)
        for d in (DATOS / "cambios").glob("2*"):
            if d.is_dir() and d.name >= sello: shutil.rmtree(d)
        for a, b in reversed(movidos):
            if a.exists(): shutil.move(str(a), str(b))
        shutil.rmtree(dest, ignore_errors=True)
        raise
    # 5. carpeta publicar/ (lo único que va al repositorio) + archivo de la revisión
    PUBLICAR.mkdir(exist_ok=True)
    for f in ("datos.enc", "formato.json"): shutil.copy2(APP / f, PUBLICAR / f)
    (PUBLICAR / "PUBLICAR.md").write_text(
        f"# Pendiente de publicar · generado {ahora:%d/%m/%Y %H:%M}\n\n"
        f"- datos.enc sha256: `{formato['sha256_datos_enc']}` ({formato['bytes_cifrado']:,} B)\n"
        f"- {formato['recuentos']['productos']} productos · {formato['recuentos']['imagenes_unicas']} imágenes · cambios {c['resumen'] if hubo else 'sin cambios'}\n"
        f"- Mensaje de commit: «Datos: actualización {ahora:%d/%m/%Y}»\n\n"
        "Subir SOLO `datos.enc` y `formato.json` a la raíz de `main` de jorgefausto0074-pc/fichas-producto-alcolea "
        "(procedimiento en GUIA_ACTUALIZACION.md) y después: `actualizar.py verificar-publicado --esperar 900`.\n")
    for f in ("revision.json", "cambios.md", "cambios.xlsx", "cambios.json"):
        if (PEND / f).exists(): shutil.copy2(PEND / f, dest / f)
    shutil.rmtree(PEND)
    seg = round(time.time() - t0, 1)
    print(f"\n✓ APLICADO en {seg} s. {len(nuevo_doc['productos'])} fichas · {formato['recuentos']['imagenes_unicas']} imágenes únicas · "
          f"cambios {c['resumen'] if hubo else '(sin cambios de datos)'}.\n  Listo para publicar: {PUBLICAR}/ (datos.enc + formato.json)."
          f"\n  Registro: {dest} · respaldo previo: {respaldo}")
    return dict(segundos=seg, formato=formato, cambios=c, paquete=vp)


# ----------------------------------------------------------------------------- publicado
def descarga(url, dest=None):
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "actualizar.py"})
    with urllib.request.urlopen(req, timeout=60) as r:
        b = r.read()
    if dest: Path(dest).write_bytes(b)
    return b


def verificar_publicado(esperar=0, local=None):
    local = json.loads(Path(local or (PUBLICAR / "formato.json" if (PUBLICAR / "formato.json").exists() else APP / "formato.json")).read_text())
    objetivo = local["sha256_datos_enc"]
    t0 = time.time()
    while True:
        try:
            web = json.loads(descarga(f"{URL_APP}formato.json?nocache={int(time.time())}"))
        except Exception as e:
            web = {"sha256_datos_enc": f"(error: {e})"}
        if web.get("sha256_datos_enc") == objetivo: break
        if time.time() - t0 >= esperar:
            print(f"✗ La web aún sirve {web.get('sha256_datos_enc')}; se esperaba {objetivo}."); return False
        print(f"  … la web aún no tiene la versión nueva ({int(time.time()-t0)} s)", flush=True); time.sleep(20)
    print(f"✓ formato.json publicado = local (sha256 datos.enc {objetivo}) tras {int(time.time()-t0)} s")
    with tempfile.TemporaryDirectory() as d:
        Path(d, "formato.json").write_text(json.dumps(web))
        descarga(f"{URL_APP}datos.enc?v={objetivo}", Path(d, "datos.enc"))
        r = subprocess.run(["node", HERE / "verifica_paquete.mjs", d, HERE / "descifrar-referencia.mjs"], capture_output=True, text=True, env=env_node())
    vp = json.loads(r.stdout) if r.stdout.strip().startswith("{") else {"ok": False, "errores": [r.stderr]}
    print(f"{'✓' if vp['ok'] else '✗'} datos.enc descargado de la web: {vp.get('productos')} productos, {vp.get('imagenes_unicas')} imágenes, "
          f"cambios {vp.get('cambios') and vp['cambios']['resumen']} (fecha_anterior {vp.get('cambios') and vp['cambios']['fecha_anterior']}); errores: {vp.get('errores')}")
    return vp["ok"]

# ----------------------------------------------------------------------------- publicar (vía gh, si está autenticado)
REPO = "jorgefausto0074-pc/fichas-producto-alcolea"


def gh(*args, entrada=None):
    r = subprocess.run(["gh", "api", *args] + (["--input", entrada] if entrada else []), capture_output=True, text=True)
    if r.returncode: raise Rechazo(f"gh api {' '.join(args[:3])} falló: {r.stderr.strip()[:400]}")
    return json.loads(r.stdout) if r.stdout.strip() else {}


def publicar(mensaje):
    """Un único commit en main que cambia SOLO datos.enc y formato.json (API git de GitHub con 'gh').
    Requiere 'gh auth login' hecho en esta máquina. Si main se ha movido mientras tanto, GitHub rechaza el avance."""
    import base64
    if subprocess.run(["gh", "auth", "status"], capture_output=True).returncode:
        raise Rechazo("gh no está autenticado en esta máquina: publicar con el navegador (GUIA_ACTUALIZACION.md, método A).")
    for f in ("datos.enc", "formato.json"):
        if not (PUBLICAR / f).exists(): raise Rechazo(f"Falta publicar/{f}: ejecutar antes 'aplicar'.")
    formato = json.loads((PUBLICAR / "formato.json").read_text())
    if sha256(PUBLICAR / "datos.enc") != formato["sha256_datos_enc"]: raise Rechazo("publicar/datos.enc no coincide con publicar/formato.json")
    base = gh(f"repos/{REPO}/git/ref/heads/main")["object"]["sha"]
    arbol = gh(f"repos/{REPO}/git/commits/{base}")["tree"]["sha"]
    entradas = []
    with tempfile.TemporaryDirectory() as d:
        for f in ("datos.enc", "formato.json"):
            b = (PUBLICAR / f).read_bytes()
            Path(d, "blob.json").write_text(json.dumps({"content": base64.b64encode(b).decode(), "encoding": "base64"}))
            sha_git = hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()
            blob = gh("-X", "POST", f"repos/{REPO}/git/blobs", entrada=str(Path(d, "blob.json")))["sha"]
            if blob != sha_git: raise Rechazo(f"El blob subido de {f} no coincide ({blob} ≠ {sha_git})")
            entradas.append({"path": f, "mode": "100644", "type": "blob", "sha": blob})
        Path(d, "tree.json").write_text(json.dumps({"base_tree": arbol, "tree": entradas}))
        nuevo_arbol = gh("-X", "POST", f"repos/{REPO}/git/trees", entrada=str(Path(d, "tree.json")))["sha"]
        Path(d, "commit.json").write_text(json.dumps({"message": mensaje, "tree": nuevo_arbol, "parents": [base]}))
        commit = gh("-X", "POST", f"repos/{REPO}/git/commits", entrada=str(Path(d, "commit.json")))["sha"]
        cmp_ = gh(f"repos/{REPO}/compare/{base}...{commit}")
        cambiados = sorted(x["filename"] for x in cmp_.get("files", []))
        if not set(cambiados) <= {"datos.enc", "formato.json"}: raise Rechazo(f"El commit tocaría otros ficheros: {cambiados}")
        Path(d, "ref.json").write_text(json.dumps({"sha": commit, "force": False}))
        gh("-X", "PATCH", f"repos/{REPO}/git/refs/heads/main", entrada=str(Path(d, "ref.json")))
    print(f"✓ Commit {commit} en main (padre {base}); ficheros: {', '.join(cambiados) or '(sin cambios)'}")
    return commit


def estado():
    d = json.loads((DATOS / "productos.json").read_text())
    f = json.loads((APP / "formato.json").read_text())
    print(f"Datos: {d['generado']} · {d['n_productos']} fichas · fuentes: {', '.join(x['pdf'] for x in d['fuentes'])}")
    print(f"Paquete local: sha256 {f['sha256_datos_enc']} · {f['recuentos']['imagenes_unicas']} imágenes")
    print("Revisión pendiente:", "SÍ → " + str(PEND / "cambios.md") if (PEND / "revision.json").exists() else "no")
    try:
        w = json.loads(descarga(f"{URL_APP}formato.json?nocache={int(time.time())}"))
        print(f"Web: sha256 {w['sha256_datos_enc']} → {'IGUAL que el local' if w['sha256_datos_enc'] == f['sha256_datos_enc'] else 'DISTINTA del local (falta publicar)'}")
    except Exception as e:
        print("Web: no se pudo consultar:", e)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="orden", required=True)
    r = sp.add_parser("revisar"); r.add_argument("pdf", nargs="*")
    sp.add_parser("aplicar")
    v = sp.add_parser("verificar-publicado"); v.add_argument("--esperar", type=int, default=0, help="segundos máximos de espera")
    v.add_argument("--formato", help="formato.json esperado (por defecto publicar/formato.json)")
    sp.add_parser("estado")
    pb = sp.add_parser("publicar", help="sube publicar/ a main con gh (solo si gh está autenticado) y verifica la web")
    pb.add_argument("--mensaje", default=f"Datos: actualización {dt.date.today():%d/%m/%Y}")
    a = ap.parse_args()
    try:
        if a.orden == "revisar": revisar(a.pdf)
        elif a.orden == "aplicar": aplicar()
        elif a.orden == "verificar-publicado": sys.exit(0 if verificar_publicado(a.esperar, a.formato) else 1)
        elif a.orden == "publicar":
            publicar(a.mensaje); sys.exit(0 if verificar_publicado(900) else 1)
        else: estado()
    except Rechazo as e:
        print(f"\n✗ NO SE HA HECHO NADA: {e}", file=sys.stderr); sys.exit(2)


if __name__ == "__main__":
    main()
