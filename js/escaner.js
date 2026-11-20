// Lector de códigos de barras. Primero BarcodeDetector nativo (Android/Chrome); si no existe
// (Safari en iPhone/iPad), ZXing con varias pasadas: franja central, fotograma entero y girado 90°.
let lectorPromesa = null;

function formatosNativos() {
  return ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'];
}

export function hayLectorNativo() {
  return typeof BarcodeDetector !== 'undefined';
}

export async function lectorZxing() {
  if (!lectorPromesa) {
    lectorPromesa = import('./vendor/zxing-ean.js').then((zx) => {
      const pistas = new Map();
      pistas.set(zx.DecodeHintType.POSSIBLE_FORMATS, [
        zx.BarcodeFormat.EAN_13,
        zx.BarcodeFormat.EAN_8,
        zx.BarcodeFormat.UPC_A,
        zx.BarcodeFormat.UPC_E,
        zx.BarcodeFormat.ITF,
        zx.BarcodeFormat.CODE_128,
      ]);
      pistas.set(zx.DecodeHintType.TRY_HARDER, true);
      const lector = new zx.MultiFormatReader();
      lector.setHints(pistas);
      return { zx, lector };
    }).catch((err) => {
      lectorPromesa = null; // permite reintentar
      throw err;
    });
  }
  return lectorPromesa;
}

async function decodificarNativo(origen) {
  if (!hayLectorNativo()) return null;
  try {
    const detector = new BarcodeDetector({ formats: formatosNativos() });
    const codigos = await detector.detect(origen);
    const texto = codigos?.[0]?.rawValue;
    return texto ? { texto, motor: 'nativo' } : null;
  } catch {
    try {
      const detector = new BarcodeDetector();
      const codigos = await detector.detect(origen);
      const texto = codigos?.[0]?.rawValue;
      return texto ? { texto, motor: 'nativo' } : null;
    } catch {
      return null;
    }
  }
}

// Copia una región (sx, sy, sw, sh) del origen a un lienzo de ancho máximo `maxAncho`, opcionalmente girada 90°.
function recorte(origen, sx, sy, sw, sh, maxAncho, girar) {
  const escala = Math.min(1, maxAncho / Math.max(sw, 1));
  const w = Math.max(1, Math.round(sw * escala));
  const h = Math.max(1, Math.round(sh * escala));
  const c = document.createElement('canvas');
  c.width = girar ? h : w;
  c.height = girar ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (girar) {
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(origen, sx, sy, sw, sh, 0, 0, w, h);
  return c;
}

function zxingSobre(zx, lector, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const luminancias = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < imagen.data.length; i += 4, j += 1) {
    luminancias[j] = (imagen.data[i] * 77 + imagen.data[i + 1] * 150 + imagen.data[i + 2] * 29) >> 8;
  }
  const fuente = new zx.RGBLuminanceSource(luminancias, canvas.width, canvas.height);
  for (const Binarizador of [zx.HybridBinarizer, zx.GlobalHistogramBinarizer].filter(Boolean)) {
    try {
      const resultado = lector.decode(new zx.BinaryBitmap(new Binarizador(fuente)));
      lector.reset();
      return resultado.getText();
    } catch {
      lector.reset();
    }
  }
  return null;
}

// Pasadas de ZXing sobre un origen dibujable (canvas, vídeo, imagen) de tamaño w×h.
// opciones.completo=false limita a la franja central (para el vídeo en directo, más rápido).
async function decodificarZxing(origen, w, h, { maxAncho = 1280, completo = true } = {}) {
  const { zx, lector } = await lectorZxing();
  const pasadas = [];
  const bandaH = Math.round(h * 0.4);
  pasadas.push([0, Math.round((h - bandaH) / 2), w, bandaH, false]); // franja horizontal central
  const bandaW = Math.round(w * 0.4);
  pasadas.push([Math.round((w - bandaW) / 2), 0, bandaW, h, true]); // franja vertical central, girada
  if (completo) {
    pasadas.push([0, 0, w, h, false]);
    pasadas.push([0, 0, w, h, true]);
  }
  for (const [sx, sy, sw, sh, girar] of pasadas) {
    const lienzo = recorte(origen, sx, sy, sw, sh, girar ? Math.min(maxAncho, 1280) : maxAncho, girar);
    const texto = zxingSobre(zx, lector, lienzo);
    if (texto) return { texto, motor: 'zxing' };
  }
  return null;
}

export async function decodificarCanvas(canvas, opciones = {}) {
  const nativo = await decodificarNativo(canvas);
  if (nativo) return nativo;
  const w = canvas.videoWidth || canvas.width;
  const h = canvas.videoHeight || canvas.height;
  if (!w || !h) return null;
  return decodificarZxing(canvas, w, h, opciones);
}

export async function decodificarImagen(img, opciones = {}) {
  const w0 = img.naturalWidth || img.videoWidth || img.width;
  const h0 = img.naturalHeight || img.videoHeight || img.height;
  const escala = Math.min(1, 2000 / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * escala);
  canvas.height = Math.round(h0 * escala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return decodificarCanvas(canvas, { maxAncho: 2000, ...opciones });
}

// Lee un fichero de imagen (foto de la cámara nativa) y devuelve el código o null.
export async function decodificarArchivo(archivo) {
  let img;
  if (typeof createImageBitmap === 'function') {
    try { img = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch { img = null; }
  }
  if (!img) {
    const url = URL.createObjectURL(archivo);
    try {
      img = await new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error('imagen'));
        i.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  return decodificarImagen(img);
}
