import { formatoGramos } from './calculo.js';

export function contarHasta(nodo, destino, reducido) {
  const previo = Number(nodo.dataset.cent);
  nodo.dataset.cent = String(destino);
  if (reducido || !Number.isFinite(previo) || previo === destino) {
    nodo.textContent = formatoGramos(destino);
    return;
  }
  const inicio = performance.now();
  const desde = previo;
  const paso = (ahora) => {
    const p = Math.min(1, (ahora - inicio) / 380);
    const v = Math.round(desde + (destino - desde) * p);
    nodo.textContent = formatoGramos(v);
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
