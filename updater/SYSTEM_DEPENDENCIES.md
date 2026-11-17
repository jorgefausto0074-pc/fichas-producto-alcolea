# System dependencies

| Needed | What | Why |
|---|---|---|
| **Yes** | Python **3.13** (tested 3.13.5; `actions/setup-python` with `python-version: '3.13'`) | Runs the updater. 3.12 should work but is untested. |
| **Yes** | Node.js **>= 20** (tested v24.22.1; `actions/setup-node`) | `verifica_paquete.mjs` re-opens the new `datos.enc` with the same WebCrypto code the web app uses (`crypto.subtle`, `DecompressionStream`). `aplicar` fails if `node` is missing. |
| No | MuPDF, poppler, Ghostscript | Not used: `pymupdf` and `pypdfium2` wheels bundle their own libraries. |
| No | Tesseract + language packs, OCR caches | Not used. The extraction reads the PDF text layer (vector text), it does not OCR. OCR was only an optional one-off audit in the original project (≈45 min); the fast MuPDF word-by-word cross-check runs on every `aplicar`. |
| No | Fonts | Not used: page crops are rendered by MuPDF from the fonts embedded in the PDFs. |
| Optional | .NET 8 + an Open XML SDK validator (env `DOTNET`, `OOXMLVAL`) | Only with `--xlsx`, to validate the optional XLSX. Skipped (not failed) when absent. |

`ubuntu-latest` (24.04) needs nothing from apt. Wheels exist for manylinux x86_64 for every pinned package.
