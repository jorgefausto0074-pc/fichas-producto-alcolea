// Actualiza los pesos pintados en la foto de la ficha que ya está en pantalla.
// No toca otra ficha: al cambiar por el hash, la vista se sustituye entera.

export function refrescarFoto(desde, preparada, nuevo) {
  if (!desde?.isConnected) return;
  const raiz = typeof desde.closest === 'function'
    ? (desde.closest('article.ficha') || desde)
    : desde;
  raiz.querySelectorAll('[data-peso]').forEach((nodo) => {
    const i = Number(nodo.dataset.peso);
    const zona = preparada.zonas[i];
    const fila = nuevo?.filas?.[i];
    if (!zona || (nuevo && !fila)) return;
    const medio = fila ? fila.medioC : zona.medioC;
    if (nodo.classList.contains('seg')) {
      const filas = nuevo ? nuevo.filas : preparada.zonas;
      const total = filas.reduce((s, f) => s + f.medioC, 0) || 1;
      nodo.style.height = `${(medio / total) * 100}%`;
      return;
    }
    const texto = nodo.dataset.banda ? `${zona.nombre} ${formato(medio)} g` : `${formato(medio)} g`;
    nodo.textContent = texto;
  });
}

function formato(centesimas) {
  const v = Math.abs(Math.trunc(centesimas));
  return `${Math.floor(v / 100)},${String(v % 100).padStart(2, '0')}`;
}
