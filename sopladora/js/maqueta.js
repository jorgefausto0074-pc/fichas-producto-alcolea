// Coloca las zonas en la foto solo si hay altura total en cm y la boca y la base medidas.
// Sin altura total no se estima nada: el visor sigue con el reparto que ya tenía.

export function tramosEscala({ cortes, nZonas, alturaTotalCm, bocaPct, basePct }) {
  const desc = [...(cortes || [])].map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
  const alturaOk = Number.isFinite(alturaTotalCm) && alturaTotalCm > 0;
  const marcoOk = Number.isFinite(bocaPct) && Number.isFinite(basePct) && basePct > bocaPct && bocaPct >= 0 && basePct <= 100;
  const cortesOk = desc.length + 1 === nZonas && desc.every((c) => c < alturaTotalCm);
  if (!alturaOk || !marcoOk || !cortesOk) return { aEscala: false, alturas: null, marcas: null };
  const span = basePct - bocaPct;
  const desdeArriba = (cm) => basePct - (cm / alturaTotalCm) * span;
  const limites = [bocaPct, ...desc.map(desdeArriba), basePct];
  const alturas = [{ hueco: true, alto: bocaPct }];
  const marcas = [];
  for (let i = 0; i < nZonas; i += 1) {
    alturas.push({ hueco: false, alto: limites[i + 1] - limites[i] });
    if (i < desc.length) marcas.push({ cm: desc[i], top: limites[i + 1] });
  }
  alturas.push({ hueco: true, alto: 100 - basePct });
  return { aEscala: true, alturas, marcas };
}
