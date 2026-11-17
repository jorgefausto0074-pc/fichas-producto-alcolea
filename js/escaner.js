let lectorPromesa = null;

function formatosNativos() {
  return ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'];
}

async function lectorZxing() {
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
    });
  }
  return lectorPromesa;
}

async function decodificarNativo(origen) {
  if (typeof BarcodeDetector === 'undefined') return null;
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

export async function decodificarCanvas(canvas) {
  const nativo = await decodificarNativo(canvas);
  if (nativo) return nativo;
  const { zx, lector } = await lectorZxing();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const luminancias = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < imagen.data.length; i += 4, j += 1) {
    luminancias[j] = (imagen.data[i] + imagen.data[i + 1] + imagen.data[i + 2]) / 3;
  }
  try {
    const fuente = new zx.RGBLuminanceSource(luminancias, canvas.width, canvas.height);
    const mapa = new zx.BinaryBitmap(new zx.HybridBinarizer(fuente));
    const resultado = lector.decode(mapa);
    lector.reset();
    return { texto: resultado.getText(), motor: 'zxing' };
  } catch {
    lector.reset();
    return null;
  }
}

export async function decodificarImagen(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return decodificarCanvas(canvas);
}
