#!/usr/bin/env python3
"""
Headless updater for GitHub Actions (stateless). See README_ACTUALIZADOR.md.

  PT_PASSWORD=... python updater/ci_actualizar.py revisar --anterior DIR (--pdf F ... | --entrada entrada.enc --entrada-formato entrada.json) --salida OUT
      -> OUT/informe.enc + OUT/informe.json (encrypted 'pendiente' report) + OUT/resumen.txt (counts only)
  PT_PASSWORD=... python updater/ci_actualizar.py aplicar  --anterior DIR (same PDFs) --informe OUT/informe.enc --informe-formato OUT/informe.json --salida OUT2
      -> OUT2/datos.enc + OUT2/formato.json (+ resumen.txt). Refuses if the PDFs / previous package / changes differ from the approved report.
  PT_PASSWORD=... python updater/ci_actualizar.py empaquetar-entrada --pdf F ... --salida DIR   (test helper: builds entrada.enc + entrada.json like the web app)

DIR (--anterior) = folder with the currently published datos.enc + formato.json.
Nothing written to stdout/OUT contains product data in clear text; the decrypted working state lives only in --trabajo
(a temporary folder, deleted at the end unless --conservar-trabajo).
"""
import argparse, contextlib, hashlib, json, os, shutil, sys, tempfile, time

# Las fechas de las fichas (generado, cambios) van en hora de la planta, no en la UTC del runner.
os.environ["TZ"] = "Europe/Madrid"
time.tzset()
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def sha256b(b): return hashlib.sha256(b).hexdigest()


def preparar_entorno(args):
    if not os.environ.get("PT_PASSWORD"):   # antes de crear nada
        sys.exit("ERROR: falta la variable de entorno PT_PASSWORD (contraseña de la app). No se puede cifrar ni descifrar.")
    trabajo = Path(args.trabajo or tempfile.mkdtemp(prefix="pt-trabajo-")).resolve()
    trabajo.mkdir(parents=True, exist_ok=True)
    if any(trabajo.iterdir()): sys.exit(f"ERROR: work folder {trabajo} must be empty")
    os.environ["PT_BASE"] = str(trabajo)
    os.environ["PT_XLSX"] = "1" if getattr(args, "xlsx", False) else "0"
    import bundle
    bundle.contrasena()      # fails clearly if PT_PASSWORD is missing
    return trabajo


def reconstruir(trabajo, anterior):
    """Previous state from the published package: datos/productos.json (byte-identical to the one that produced it),
    datos/imagenes/<SAP>/<casilla>.jpg and datos/cambios/ultimo.json."""
    import bundle
    indice, blob, formato = bundle.abre(Path(anterior) / "datos.enc", Path(anterior) / "formato.json")
    doc = indice["doc"]
    datos = trabajo / "datos"; (datos / "cambios").mkdir(parents=True)
    for h, m in indice["imagenes"].items():
        b = blob[m["offset"]:m["offset"] + m["longitud"]]
        if sha256b(b) != h: raise SystemExit(f"ERROR: corrupt image in previous package ({h[:12]})")
        for r in m["rutas"]:
            f = (datos / r).resolve()
            if datos.resolve() not in f.parents: raise SystemExit("ERROR: unsafe image path in previous package")
            f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(b)
    for p in doc["productos"]:
        hs = p.pop("imagenes_sha256", {})
        for cas, ruta in p.get("imagenes", {}).items():
            if sha256b((datos / ruta).read_bytes()) != hs.get(cas): raise SystemExit("ERROR: image/index mismatch in previous package")
    (datos / "productos.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    if indice.get("cambios") is not None:
        (datos / "cambios" / "ultimo.json").write_text(json.dumps(indice["cambios"], ensure_ascii=False, indent=1))
    (trabajo / "app-data").mkdir()
    for f in ("datos.enc", "formato.json"): shutil.copy2(Path(anterior) / f, trabajo / "app-data" / f)
    (trabajo / "fuentes").mkdir()
    return dict(productos=len(doc["productos"]), imagenes=len(indice["imagenes"]), generado=doc.get("generado"),
                sha256_datos_enc=formato["sha256_datos_enc"])


def recoger_pdfs(trabajo, args):
    entrada = trabajo / "entrada"; entrada.mkdir()
    out = []
    for f in args.pdf or []:
        d = entrada / Path(f).name; shutil.copy2(f, d); out.append(d)
    if args.entrada:
        import bundle
        indice, blob, _ = bundle.abre(args.entrada, args.entrada_formato)
        if indice.get("tipo") != "entrada": raise SystemExit("ERROR: --entrada is not an 'entrada' package")
        for a in indice["archivos"]:
            b = blob[a["offset"]:a["offset"] + a["longitud"]]
            if sha256b(b) != a["sha256"]: raise SystemExit("ERROR: corrupt PDF inside entrada.enc")
            nombre = Path(a["nombre"]).name
            if not nombre.lower().endswith(".pdf"): nombre += ".pdf"
            d = entrada / nombre; d.write_bytes(b); out.append(d)
    if not out: raise SystemExit("ERROR: no PDFs given (--pdf or --entrada)")
    return out


def resumen_txt(etapa, rev, extra=""):
    r = rev["resumen"]
    lin = [f"[{etapa}] altas={r['altas']} bajas={r['bajas']} productos_modificados={r['modificados']} "
           f"valores_modificados={rev['valores_modificados']} incidencias_nuevas={rev['incidencias_nuevas']} "
           f"incidencias_resueltas={rev['incidencias_resueltas']} imagenes_cambiadas={len(rev['imagenes_cambiadas'])} "
           f"avisos={len(rev['avisos'])} total_fichas={rev['total_fichas']}",
           "PDFs: " + "; ".join(f"{i['grupo']}: {i['fichas']} fichas / {i['paginas']} págs" for i in rev["pdfs"]),
           "Grupos conservados del paquete anterior: " + (", ".join(rev["grupos_conservados"]) or "ninguno")]
    if extra: lin.append(extra)
    return "\n".join(lin) + "\n"


def publica_resumen(salida, texto):
    (salida / "resumen.txt").write_text(texto)
    print(texto, end="")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f: f.write("```\n" + texto + "```\n")


def hacer_revision(args, trabajo, log):
    previo = reconstruir(trabajo, args.anterior)
    pdfs = recoger_pdfs(trabajo, args)
    import actualizar
    with open(log, "a") as fl, contextlib.redirect_stdout(fl):    # the full report has product values: never to stdout
        rev = actualizar.revisar([str(p) for p in pdfs])
    for i in rev["pdfs"]: i.pop("original", None)
    return previo, rev, actualizar


def informe_indice(previo, rev, pend):
    inc = json.loads((pend / "incidencias.json").read_text())
    return {"tipo": "pendiente", "imagenes": {}, "cambios": json.loads((pend / "cambios.json").read_text()),
            "doc": {"tipo": "pendiente", "version_informe": 1,
                    "base": {"sha256_datos_enc": previo["sha256_datos_enc"], "generado": previo["generado"], "productos": previo["productos"]},
                    "revision": rev, "informe_md": (pend / "cambios.md").read_text(),
                    "incidencias_nuevas": inc["nuevas"], "incidencias_resueltas": inc["resueltas"]}}


def cmd_revisar(args):
    t0 = time.time()
    trabajo = preparar_entorno(args); salida = Path(args.salida); salida.mkdir(parents=True, exist_ok=True)
    try:
        previo, rev, act = hacer_revision(args, trabajo, trabajo / "revisar.log")
        import bundle
        enc, formato = bundle.cifra_indice(informe_indice(previo, rev, act.PEND), extra_formato=dict(
            tipo="pendiente", base_sha256_datos_enc=previo["sha256_datos_enc"], resumen=rev["resumen"]))
        (salida / "informe.enc").write_bytes(enc)
        (salida / "informe.json").write_text(json.dumps(formato, ensure_ascii=False, indent=1))
        publica_resumen(salida, resumen_txt("revisar", rev, f"tiempo={time.time()-t0:.0f}s informe=informe.enc"))
    finally:
        limpiar(args, trabajo)


def cmd_aplicar(args):
    t0 = time.time()
    trabajo = preparar_entorno(args); salida = Path(args.salida); salida.mkdir(parents=True, exist_ok=True)
    try:
        import bundle
        apr, _, _ = bundle.abre(args.informe, args.informe_formato)
        if apr.get("tipo") != "pendiente": raise SystemExit("ERROR: --informe is not a 'pendiente' report")
        previo, rev, act = hacer_revision(args, trabajo, trabajo / "aplicar.log")
        a = apr["doc"]
        motivos = []
        if a["base"]["sha256_datos_enc"] != previo["sha256_datos_enc"]:
            motivos.append("the published datos.enc changed since the report was approved")
        if sorted((i["grupo"], i["sha256"]) for i in a["revision"]["pdfs"]) != sorted((i["grupo"], i["sha256"]) for i in rev["pdfs"]):
            motivos.append("the PDFs are not the ones in the approved report")
        nuevo = json.loads((act.PEND / "cambios.json").read_text())
        if any(nuevo[k] != apr["cambios"][k] for k in ("altas", "bajas", "modificados")):
            motivos.append("the changes differ from the approved report")
        if motivos: raise SystemExit("ERROR: not applied: " + "; ".join(motivos))
        with open(trabajo / "aplicar.log", "a") as fl, contextlib.redirect_stdout(fl):
            res = act.aplicar()
        for f in ("datos.enc", "formato.json"): shutil.copy2(trabajo / "app-data" / f, salida / f)
        f = res["formato"]
        publica_resumen(salida, resumen_txt("aplicar", rev,
            f"tiempo={time.time()-t0:.0f}s productos={f['recuentos']['productos']} imagenes_unicas={f['recuentos']['imagenes_unicas']} "
            f"sha256_datos_enc={f['sha256_datos_enc']} comprobaciones=OK"))
    except BaseException:
        # the log has the reason (and product values): show only the last error line, never the full log
        lg = trabajo / "aplicar.log"
        if lg.exists():
            ult = [l for l in lg.read_text().splitlines() if l.startswith(("✗", "  [FALLO]"))]
            if ult: print("Last error (see work folder for details):", ult[-1][:300], file=sys.stderr)
        raise
    finally:
        limpiar(args, trabajo)


def cmd_empaquetar_entrada(args):
    import bundle
    bundle.contrasena()
    archivos, blob = [], b""
    for f in args.pdf:
        b = Path(f).read_bytes()
        archivos.append(dict(nombre=Path(f).name, offset=len(blob), longitud=len(b), sha256=sha256b(b)))
        blob += b
    enc, formato = bundle.cifra_indice({"tipo": "entrada", "archivos": archivos}, blob, extra_formato=dict(tipo="entrada"))
    s = Path(args.salida); s.mkdir(parents=True, exist_ok=True)
    (s / "entrada.enc").write_bytes(enc); (s / "entrada.json").write_text(json.dumps(formato, indent=1))
    print(f"entrada.enc: {len(archivos)} PDF(s), {len(enc):,} B")


def limpiar(args, trabajo):
    if not args.conservar_trabajo: shutil.rmtree(trabajo, ignore_errors=True)
    else: print(f"(work folder kept, contains DECRYPTED data: {trabajo})", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="orden", required=True)
    for n in ("revisar", "aplicar"):
        p = sp.add_parser(n)
        p.add_argument("--anterior", required=True, help="folder with the published datos.enc + formato.json")
        p.add_argument("--pdf", action="append", help="plain PDF (repeatable)")
        p.add_argument("--entrada", help="entrada.enc (PDFs encrypted by the web app)")
        p.add_argument("--entrada-formato", help="entrada.json (public params of entrada.enc)")
        p.add_argument("--salida", required=True)
        p.add_argument("--trabajo", help="empty work folder (default: new temp folder)")
        p.add_argument("--conservar-trabajo", action="store_true", help="keep the work folder (DECRYPTED data!)")
        p.add_argument("--xlsx", action="store_true", help="also build/verify productos.xlsx inside the work folder")
        if n == "aplicar":
            p.add_argument("--informe", required=True); p.add_argument("--informe-formato", required=True)
    e = sp.add_parser("empaquetar-entrada"); e.add_argument("--pdf", action="append", required=True); e.add_argument("--salida", required=True)
    a = ap.parse_args()
    if a.orden in ("revisar", "aplicar") and a.entrada and not a.entrada_formato: ap.error("--entrada needs --entrada-formato")
    try:
        {"revisar": cmd_revisar, "aplicar": cmd_aplicar, "empaquetar-entrada": cmd_empaquetar_entrada}[a.orden](a)
    except Exception as ex:
        import actualizar
        if isinstance(ex, actualizar.Rechazo):
            print(f"REJECTED: {ex}", file=sys.stderr); sys.exit(2)
        raise


if __name__ == "__main__":
    main()
