# Updater for "Fichas de producto Alcolea" (headless / GitHub Actions)

This folder turns the two Access PDF reports ("Informe Alcolea Asépticos", "Informe Alcolea No Asépticos") into the
encrypted package the web app reads (`datos.enc` + `formato.json`), including the `cambios` (what changed) record.
It is **stateless**: the previous state is rebuilt by decrypting the currently published `datos.enc`.
It contains **no product data and no password**. The password comes only from the env var `PT_PASSWORD`.

## 1. Inputs

| Input | Where it comes from | Notes |
|---|---|---|
| `PT_PASSWORD` (env) | Repository secret | The app password. Missing → the tool exits with `ERROR: falta la variable de entorno PT_PASSWORD`. |
| `--anterior DIR` | A folder with the **currently published** `datos.enc` + `formato.json` (repo root of `main`) | Decrypted to rebuild the previous `productos.json`, the page-2 images and `imagenes_sha256`, and the previous `cambios`. |
| PDFs | either `--pdf file.pdf` (repeatable, plain) **or** `--entrada entrada.enc --entrada-formato entrada.json` (PDFs encrypted by the web app, format in §6) | One or two PDFs. The group (asépticos / no asépticos) is detected from the **content**. With one PDF, the other group's products and images are kept from the previous package. Never commit plain PDFs to the public repo: use `entrada.enc`. |
| `--informe informe.enc --informe-formato informe.json` (only `aplicar`) | Output of `revisar`, approved by the user in the app | `aplicar` refuses if the previous package, the PDFs (sha256) or the changes differ from the approved report. |

## 2. Outputs (all safe to publish: encrypted or counts only)

| Command | File | Content |
|---|---|---|
| `revisar` | `OUT/informe.enc` | Encrypted "pendiente" report (format §5): full before → after values, altas, bajas, new/resolved data incidents, warnings. |
| `revisar` | `OUT/informe.json` | Public params to decrypt it (salt, iv, iterations, sha256) + `tipo: "pendiente"`, `resumen` counts and `base_sha256_datos_enc`. No product data. |
| both | `OUT/resumen.txt` (also printed to stdout and appended to `$GITHUB_STEP_SUMMARY`) | Counts only, e.g. `altas=2 bajas=1 productos_modificados=2 valores_modificados=3 …`. |
| `aplicar` | `OUT/datos.enc`, `OUT/formato.json` | The new package. Commit **only these two files** to the repo root of `main`. Pages serves them; the app loads `datos.enc?v=<formato.sha256_datos_enc>`. |

Exit codes: `0` OK · `2` rejected with a clear reason (unknown PDF layout, wrong group name, two PDFs of the same group, approved report does not match, a verification failed) · `1` other error (e.g. missing `PT_PASSWORD`, report mismatch).

## 3. How to run (headless)

```bash
python3.13 -m venv .venv && .venv/bin/pip install -r updater/requirements.txt     # node >= 20 must be on PATH
export PT_PASSWORD=***                                                            # from secrets
# 1) review (does not change anything published)
.venv/bin/python updater/ci_actualizar.py revisar --anterior . \
    --entrada actualizacion/entrada.enc --entrada-formato actualizacion/entrada.json --salida out/revision
# 2) after the user presses «Aprobar» in the app: same inputs + the approved report
.venv/bin/python updater/ci_actualizar.py aplicar --anterior . \
    --entrada actualizacion/entrada.enc --entrada-formato actualizacion/entrada.json \
    --informe out/revision/informe.enc --informe-formato out/revision/informe.json --salida out/nuevo
cp out/nuevo/datos.enc out/nuevo/formato.json .    # then commit only these two files
```
Plain PDFs instead of `--entrada`: `--pdf "x.pdf" [--pdf "y.pdf"]`.
Test helper: `ci_actualizar.py empaquetar-entrada --pdf a.pdf [--pdf b.pdf] --salida DIR` builds `entrada.enc` + `entrada.json` exactly as the app should.
Optional: `--xlsx` (also builds and checks `productos.xlsx` inside the work folder; not exported), `--trabajo DIR`, `--conservar-trabajo` (debug only, see §4).

What `aplicar` does: rebuild previous state → re-run the review and compare it with the approved report → extract (only the supplied group(s), `--parcial`) → page-2 image crops → `cambios` → `datos.enc` + `formato.json` → checks, any failure restores and exits 2:
- applied changes == reviewed changes;
- MuPDF word-by-word cross-check of every page of the supplied PDFs against the extracted JSON (nothing lost, nothing invented);
- byte-for-byte round trip of JSON and images through the new `datos.enc`; wrong password rejected;
- `node verifica_paquete.mjs` with `descifrar-referencia.mjs` (same WebCrypto code as the app): counts, image hashes, `cambios` shape;
- counts equal in JSON, `formato.json`, review and package.

## 4. Time and where decrypted data lives

Measured on a clean venv (8-core x86_64, single-threaded workload; expect up to ~1.5× on `ubuntu-latest`):

| Run | `revisar` | `aplicar` (includes a fresh review) |
|---|---|---|
| Both PDFs (245 + 77 sheets, 644 pages) | ≈ 80 s | ≈ 170 s |
| Only "No Asépticos" (77 sheets) | ≈ 18 s | ≈ 38 s |

Plus ≈ 15 s for `pip install` (wheels only). No OCR cache is used or needed (see `SYSTEM_DEPENDENCIES.md`).

**Decrypted (plain-text) state exists only inside the work folder** (`--trabajo`, default a new `/tmp/pt-trabajo-*`), deleted at the end even on failure (unless `--conservar-trabajo`):
`datos/productos.json`, `datos/imagenes/**`, `datos/geometria.json`, `datos/cambios/**` (incl. `productos_anterior.json`), `datos/productos.xlsx` (with `--xlsx`), `entrada/*.pdf`, `fuentes/**`, `actualizacion/**` (review reports `cambios.md/.json/.xlsx`, `incidencias.json`, `revision.json`, `pdfs/`, backups `respaldos/`), `revisar.log`, `aplicar.log`.
**Never** upload the work folder as an artifact, never `cat` its files, never pass `--conservar-trabajo` in CI. The repo is public, so Actions logs are public: the tool only prints counts, group names, PDF file names and sha256 values.

## 5. `informe.enc` ("pendiente" report) format

Same container and encryption as `datos.enc` (see `bundle.py` header and `descifrar-referencia.mjs`):
`informe.enc = AES-256-GCM(key, iv, plain) || tag16`, `key = PBKDF2-HMAC-SHA256(PT_PASSWORD, salt16, 600000) → 32 B`; salt/iv in `informe.json` (`sal_hex`, `iv_hex`, `iteraciones`).
`plain = "RPTB" | 0x01 | 000000 | uint32le N | gzip(JSON index, N bytes) | blob (empty for the report)`.
So the app's existing `abrirPaquete(password, informeJson, buffer)` opens it and returns `{doc, imagenes: {}, blob, cambios}` with:
```jsonc
cambios = { "fecha_anterior": str|null, "fecha_actual": str, "resumen": {"altas","bajas","modificados"},
            "altas": [{"sap","denominacion"}], "bajas": [...],
            "modificados": [{"sap","denominacion","campos":[{"ruta","etiqueta","antes","despues"}]}] }   // same shape as datos.enc
doc = { "tipo": "pendiente", "version_informe": 1,
        "base": {"sha256_datos_enc", "generado", "productos"},          // package the review was made against
        "revision": { "creado", "base_sha256", "total_fichas", "resumen", "valores_modificados",
                      "incidencias_nuevas", "incidencias_resueltas", "imagenes_cambiadas": ["<SAP> · <casilla>"],
                      "avisos": [str], "grupos_conservados": [grupo],
                      "pdfs": [{"nombre_original","destino","grupo","sha256","paginas","fichas","copiado","sustituye"}] },
        "informe_md": "<Spanish markdown report, ready to render>",
        "incidencias_nuevas": [{"sap","denominacion","tipo","campo","detalle"}], "incidencias_resueltas": [...] }
```
`antes`/`despues` are the values exactly as printed in the PDF (`null` = empty box, booleans for check boxes).
`avisos` must be shown to the user before «Aprobar» (e.g. "the PDF has fewer than half the current sheets: missing ones become BAJAS").
Inside `datos.enc` the index has the same top-level `cambios` key (shown in «Novedades»). After an approved update with no data changes, the previous `cambios` is kept.

## 6. `entrada.enc` (PDFs uploaded by the app) format

Same scheme. Index JSON: `{"tipo": "entrada", "archivos": [{"nombre": "x.pdf", "offset": 0, "longitud": 123, "sha256": "<hex of the PDF>"}]}`, blob = the PDFs concatenated (offsets relative to the blob start).
`entrada.json` = `{"formato":"RPTB","version_contenedor":1,"iteraciones":600000,"sal_hex":"<32 hex>","iv_hex":"<24 hex>","tipo":"entrada"}` (+ optional `sha256_datos_enc` = sha256 of `entrada.enc`, verified if present). Use a fresh random salt and iv each time.
Browser recipe: `CompressionStream('gzip')` for the index; `crypto.subtle.deriveKey(PBKDF2/SHA-256/600000 → AES-GCM 256)`; `crypto.subtle.encrypt({name:'AES-GCM', iv}, key, plain)` (WebCrypto appends the 16-byte tag, which is what Python expects).

## 7. Files

| File | Role |
|---|---|
| `ci_actualizar.py` | **Entry point for CI** (`revisar`, `aplicar`, `empaquetar-entrada`). |
| `actualizar.py` | Review/apply engine (PDF recognition, content-based group detection, review, apply with backup/rollback and checks). |
| `extract.py` | PDF → JSON extractor (fixed-template reader of the Access report) and page-2 image crops. |
| `cambios.py` | Diff → `cambios` record, Spanish labels, Markdown/XLSX report. |
| `bundle.py` | RPTB container + AES-256-GCM/PBKDF2 encryption; `cifra_indice`, `abre`. |
| `esquema_app.py` | Spanish field labels only. |
| `xlsx.py`, `verifica_xlsx.py` | Optional XLSX output and its cell-by-cell check. |
| `verifica_mupdf.py` | MuPDF cross-check (second PDF engine). |
| `verifica_paquete.mjs`, `descifrar-referencia.mjs` | Node verification with the app's decryption code. |
| `requirements.txt`, `SYSTEM_DEPENDENCIES.md` | Pinned Python deps; system deps. |

Code comments and user-facing messages are in Spanish (the project language).
