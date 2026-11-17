#!/usr/bin/env python3
"""
Empaquetado cifrado para la app de consulta de Productos Terminados (PWA).

Genera app-data/:
  datos.enc     paquete único cifrado (AES-256-GCM, clave PBKDF2-SHA256) con productos.json + imágenes deduplicadas
  formato.json  parámetros públicos (sal, iv, iteraciones, versión, fecha, recuentos). SIN datos de producto.

Formato del texto plano (antes de cifrar), "RPTB" v1, enteros little-endian:
  bytes 0-3   magic  b"RPTB"
  byte  4     versión de contenedor (1)
  bytes 5-7   reservado (0)
  bytes 8-11  uint32  N = longitud del índice JSON comprimido con gzip
  bytes 12..12+N        índice JSON (UTF-8, gzip):
        {"doc": <productos.json con 'imagenes_sha256' añadido a cada producto>,
         "imagenes": {"<sha256>": {"offset", "longitud", "mime", "ancho", "alto", "rutas": [...]}},
         "cambios": <datos/cambios/ultimo.json: altas/bajas/modificados frente a la versión anterior (ver build/cambios.py)>}
  bytes 12+N..fin       blob con las imágenes únicas concatenadas; offset relativo al inicio del blob.

Cifrado: datos.enc = AES-256-GCM(clave, iv 12 B, texto plano) || etiqueta 16 B (formato WebCrypto).
         clave = PBKDF2-HMAC-SHA256(contraseña UTF-8, sal 16 B aleatoria, iteraciones), 32 B.
         Sal e iv nuevos en cada generación.

Uso: PT_PASSWORD=... python bundle.py   (la contraseña SOLO llega por la variable de entorno PT_PASSWORD)
"""
import datetime as dt, gzip, hashlib, io, json, os, secrets, struct, sys, collections
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

BASE = Path(os.environ["PT_BASE"]).resolve() if os.environ.get("PT_BASE") else Path(__file__).resolve().parent.parent   # PT_BASE = carpeta de trabajo (CI)
DATOS = BASE / "datos"
SALIDA = BASE / "app-data"
ITERACIONES = 600_000
MAGIC = b"RPTB"
VERSION_CONTENEDOR = 1
VERSION_FORMATO = 1
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def clave(password, sal, it=ITERACIONES):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sal, iterations=it).derive(password.encode("utf-8"))


def construye_texto_plano(datos=DATOS):
    src = (datos / "productos.json").read_bytes()
    doc = json.loads(src)
    imagenes, blob = {}, io.BytesIO()
    for p in doc["productos"]:
        hs = {}
        for casilla, ruta in p.get("imagenes", {}).items():
            f = datos / ruta
            b = f.read_bytes()
            h = hashlib.sha256(b).hexdigest()
            if h not in imagenes:
                with Image.open(io.BytesIO(b)) as im:
                    w, hgt = im.size
                imagenes[h] = dict(offset=blob.tell(), longitud=len(b), mime=MIME.get(f.suffix.lower(), "application/octet-stream"),
                                   ancho=w, alto=hgt, rutas=[])
                blob.write(b)
            imagenes[h]["rutas"].append(ruta)
            hs[casilla] = h
        p["imagenes_sha256"] = hs
    import cambios as registro_cambios
    cambios = registro_cambios.lee_ultimo(datos, doc)
    indice = json.dumps({"doc": doc, "imagenes": imagenes, "cambios": cambios}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    indice_gz = gzip.compress(indice, 9, mtime=0)
    plano = MAGIC + bytes([VERSION_CONTENEDOR, 0, 0, 0]) + struct.pack("<I", len(indice_gz)) + indice_gz + blob.getvalue()
    return plano, doc, imagenes


def lee_texto_plano(plano):
    assert plano[:4] == MAGIC, "magic incorrecto"
    assert plano[4] == VERSION_CONTENEDOR
    (n,) = struct.unpack("<I", plano[8:12])
    indice = json.loads(gzip.decompress(plano[12:12 + n]))
    blob = plano[12 + n:]
    return indice, blob


def descifra(enc, formato, password):
    k = clave(password, bytes.fromhex(formato["sal_hex"]), formato["iteraciones"])
    return AESGCM(k).decrypt(bytes.fromhex(formato["iv_hex"]), enc, None)


def verifica(salida, password, datos=DATOS):
    """Descifra datos.enc y compara byte a byte con productos.json y cada imagen de origen."""
    formato = json.loads((salida / "formato.json").read_text())
    plano = descifra((salida / "datos.enc").read_bytes(), formato, password)
    assert hashlib.sha256(plano).hexdigest() == formato["sha256_texto_plano"], "sha256 del texto plano no coincide"
    indice, blob = lee_texto_plano(plano)
    doc = indice["doc"]
    n_img = 0
    for p in doc["productos"]:
        for casilla, h in p.pop("imagenes_sha256").items():
            meta = indice["imagenes"][h]
            b = blob[meta["offset"]:meta["offset"] + meta["longitud"]]
            orig = (datos / p["imagenes"][casilla]).read_bytes()
            assert b == orig, f"imagen distinta: {p['codigo_sap']} {casilla}"
            assert hashlib.sha256(b).hexdigest() == h
            n_img += 1
    import cambios as registro_cambios
    assert "cambios" in indice and registro_cambios.valida(indice["cambios"]), "falta 'cambios' en el índice"
    assert indice["cambios"] == registro_cambios.lee_ultimo(datos, json.loads((datos / "productos.json").read_text())), "'cambios' distinto del registro"
    rehecho = json.dumps(doc, ensure_ascii=False, indent=1).encode("utf-8")
    assert rehecho == (datos / "productos.json").read_bytes(), "productos.json reconstruido no es idéntico byte a byte"
    # contraseña incorrecta debe fallar
    try:
        descifra((salida / "datos.enc").read_bytes(), formato, password + "x"); raise AssertionError("contraseña incorrecta aceptada")
    except Exception as e:
        if isinstance(e, AssertionError): raise
    return dict(productos=len(doc["productos"]), referencias_imagen=n_img, imagenes_unicas=len(indice["imagenes"]),
                cambios=indice["cambios"]["resumen"])


def contrasena():
    """Contraseña de la app: SOLO variable de entorno PT_PASSWORD (no hay valor por defecto). Nunca imprimirla."""
    p = os.environ.get("PT_PASSWORD")
    if not p:
        sys.exit("ERROR: falta la variable de entorno PT_PASSWORD (contraseña de la app). No se puede cifrar ni descifrar.")
    return p


def main(salida=SALIDA, password=None, datos=DATOS, log=print):
    password = password or contrasena()
    salida = Path(salida); salida.mkdir(parents=True, exist_ok=True)
    plano, doc, imagenes = construye_texto_plano(datos)
    sal, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    enc = AESGCM(clave(password, sal)).encrypt(iv, plano, None)
    ps = doc["productos"]
    formato = collections.OrderedDict(
        formato="RPTB", version_formato=VERSION_FORMATO, version_contenedor=VERSION_CONTENEDOR,
        generado=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        datos_generados=doc.get("generado"),
        fuentes=[f["pdf"] for f in doc.get("fuentes", [])],
        cifrado=dict(algoritmo="AES-256-GCM", iv_bytes=12, etiqueta_bytes=16, etiqueta_al_final=True, aad=None),
        kdf=dict(algoritmo="PBKDF2", hash="SHA-256", longitud_clave_bytes=32, codificacion_password="UTF-8"),
        iteraciones=ITERACIONES, sal_hex=sal.hex(), iv_hex=iv.hex(),
        recuentos=dict(productos=len(ps),
                       por_grupo=dict(collections.Counter(p["grupo_pdf"] for p in ps)),
                       con_gas=sum(1 for p in ps if p.get("con_gas_derivado")),
                       sin_gas=sum(1 for p in ps if not p.get("con_gas_derivado")),
                       referencias_imagen=sum(len(p.get("imagenes", {})) for p in ps),
                       imagenes_unicas=len(imagenes)),
        bytes_texto_plano=len(plano), bytes_cifrado=len(enc),
        sha256_texto_plano=hashlib.sha256(plano).hexdigest(),
        sha256_datos_enc=hashlib.sha256(enc).hexdigest(),
    )
    tmp = salida / "datos.enc.tmp"; tmp.write_bytes(enc); tmp.replace(salida / "datos.enc")
    (salida / "formato.json").write_text(json.dumps(formato, ensure_ascii=False, indent=1))
    r = verifica(salida, password, datos)
    log(f"bundle OK → {salida/'datos.enc'} ({len(enc):,} B) · {r['productos']} productos · "
        f"{r['referencias_imagen']} refs → {r['imagenes_unicas']} imágenes únicas · cambios {r['cambios']} · ida y vuelta byte a byte OK")
    return formato


# ----------------------------------------------------------------------------- helpers genéricos (CI)
def cifra_indice(indice, blob=b"", password=None, extra_formato=None):
    """Cifra un índice JSON arbitrario (+ blob) con el MISMO esquema que datos.enc. Devuelve (enc, formato)."""
    password = password or contrasena()
    indice_gz = gzip.compress(json.dumps(indice, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9, mtime=0)
    plano = MAGIC + bytes([VERSION_CONTENEDOR, 0, 0, 0]) + struct.pack("<I", len(indice_gz)) + indice_gz + blob
    sal, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    enc = AESGCM(clave(password, sal)).encrypt(iv, plano, None)
    formato = collections.OrderedDict(
        formato="RPTB", version_formato=VERSION_FORMATO, version_contenedor=VERSION_CONTENEDOR,
        generado=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        cifrado=dict(algoritmo="AES-256-GCM", iv_bytes=12, etiqueta_bytes=16, etiqueta_al_final=True, aad=None),
        kdf=dict(algoritmo="PBKDF2", hash="SHA-256", longitud_clave_bytes=32, codificacion_password="UTF-8"),
        iteraciones=ITERACIONES, sal_hex=sal.hex(), iv_hex=iv.hex(), **(extra_formato or {}),
        bytes_texto_plano=len(plano), bytes_cifrado=len(enc),
        sha256_texto_plano=hashlib.sha256(plano).hexdigest(), sha256_datos_enc=hashlib.sha256(enc).hexdigest())
    return enc, formato


def abre(enc_path, formato_path, password=None):
    """Descifra un fichero RPTB (datos.enc, informe.enc, entrada.enc). Devuelve (indice, blob, formato)."""
    formato = json.loads(Path(formato_path).read_text())
    enc = Path(enc_path).read_bytes()
    if hashlib.sha256(enc).hexdigest() != formato.get("sha256_datos_enc", hashlib.sha256(enc).hexdigest()):
        raise ValueError(f"{enc_path}: sha256 no coincide con {formato_path}")
    plano = descifra(enc, formato, password or contrasena())
    indice, blob = lee_texto_plano(plano)
    return indice, blob, formato


if __name__ == "__main__":
    main(*(sys.argv[1:2] or []))
