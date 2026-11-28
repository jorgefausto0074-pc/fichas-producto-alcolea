// Reparto de gramaje en centésimas enteras (mayor resto). Sin coma flotante.

export function repartoMayorResto(partes, total) {
  if (!Number.isInteger(total) || total < 0) throw new Error('total');
  if (!partes.length || partes.some((p) => !Number.isInteger(p) || p < 0)) throw new Error('partes');
  const suma = partes.reduce((a, b) => a + b, 0);
  if (suma <= 0) throw new Error('suma');
  if (total === 0) return partes.map(() => 0);
  const base = partes.map((p) => Math.floor((total * p) / suma));
  const resto = total - base.reduce((a, b) => a + b, 0);
  const orden = partes.map((p, i) => ({ i, frac: (total * p) % suma, peso: p }));
  orden.sort((a, b) => b.frac - a.frac || b.peso - a.peso || a.i - b.i);
  for (let k = 0; k < resto; k += 1) base[orden[k].i] += 1;
  return base;
}

export function aCentesimasNumero(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('número');
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) throw new Error('más de 2 decimales');
  return cents;
}

export function textoACentesimas(texto) {
  const t = String(texto ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!t) return { ok: false, motivo: 'vacio' };
  if (/^\d+\.$/.test(t)) {
    const cents = Number(t.slice(0, -1)) * 100;
    if (cents <= 0) return { ok: false, motivo: 'no-positivo' };
    return { ok: true, centesimas: cents, parcial: true, redondeado: false };
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, motivo: 'formato' };
  const [ent, dec = ''] = t.split('.');
  if (ent.length > 6) return { ok: false, motivo: 'formato' };
  let cents = Number(ent) * 100 + Number((dec + '00').slice(0, 2));
  if (dec.length > 2 && Number(dec[2]) >= 5) cents += 1;
  if (cents <= 0) return { ok: false, motivo: 'no-positivo' };
  return { ok: true, centesimas: cents, redondeado: dec.length > 2 };
}

export function formatoGramos(c, { signo = false } = {}) {
  const neg = c < 0;
  const v = Math.abs(Math.trunc(c));
  const num = `${Math.floor(v / 100)},${String(v % 100).padStart(2, '0')}`;
  if (neg) return `−${num}`;
  if (signo && c > 0) return `+${num}`;
  return num;
}

export function formatoPct(unidades) {
  const neg = unidades < 0;
  const v = Math.abs(Math.trunc(unidades));
  return `${neg ? '−' : ''}${Math.floor(v / 100)},${String(v % 100).padStart(2, '0')}`;
}

export function juicioMedida(cents, minC, maxC) {
  if (cents == null || !Number.isFinite(cents)) return 'vacio';
  if (cents < minC - 20 || cents > maxC + 20) return 'extremo';
  if (cents < minC || cents > maxC) return 'fuera';
  return 'dentro';
}

export function clasificarMedida(texto, minC, maxC) {
  const pedido = textoACentesimas(texto);
  if (pedido.ok) return juicioMedida(pedido.centesimas, minC, maxC);
  const t = String(texto ?? '').trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(t) && Number(t) === 0) return 'extremo';
  return 'vacio';
}

export function fueraDeLoHabitual(nC, patronC) {
  return nC * 4 < patronC * 3 || nC * 4 > patronC * 5;
}

export function prepararFicha(ficha) {
  const zonas = [...ficha.zonas]
    .sort((a, b) => a.orden - b.orden)
    .map((z) => {
      const minC = aCentesimasNumero(z.min);
      const maxC = aCentesimasNumero(z.max);
      const medioC = aCentesimasNumero(z.medio);
      return {
        ...z,
        minC,
        maxC,
        medioC,
        minMinC: minC - 20,
        maxMaxC: maxC + 20,
      };
    });
  const sumaC = zonas.reduce((s, z) => s + z.medioC, 0);
  const sumaMinC = zonas.reduce((s, z) => s + z.minC, 0);
  const sumaMaxC = zonas.reduce((s, z) => s + z.maxC, 0);
  const pct = repartoMayorResto(zonas.map((z) => z.medioC), 10000);
  return { zonas, sumaC, sumaMinC, sumaMaxC, pct };
}

export function calcularNuevo(preparada, nC) {
  const medios = repartoMayorResto(preparada.zonas.map((z) => z.medioC), nC);
  const filas = preparada.zonas.map((z, i) => {
    const medio = medios[i];
    const min = medio - (z.medioC - z.minC);
    const max = medio + (z.maxC - z.medioC);
    return { medioC: medio, minC: min, maxC: max, minMinC: min - 20, maxMaxC: max + 20 };
  });
  const pct = repartoMayorResto(medios, 10000);
  const sumaC = medios.reduce((a, b) => a + b, 0);
  return { filas, pct, sumaC };
}

// Una zona queda fijada. El resto reparte N menos esa zona, en proporción a sus % originales.
export function calcularAjustado(preparada, nC, ajuste) {
  if (!ajuste) return { ok: true, ...calcularNuevo(preparada, nC), ajustado: false };
  const n = preparada.zonas.length;
  const i = ajuste.indice;
  if (!Number.isInteger(nC) || nC <= 0) return { ok: false, motivo: 'gramaje' };
  if (!Number.isInteger(i) || i < 0 || i >= n) return { ok: false, motivo: 'zona' };
  const originales = preparada.pct;
  const otros = originales.map((_, k) => k).filter((k) => k !== i);
  const pesos = otros.map((k) => originales[k]);
  if (!otros.length || pesos.some((p) => !Number.isInteger(p) || p <= 0)) return { ok: false, motivo: 'reparto' };
  let medios;
  let pcts;
  try {
    if (ajuste.modo === 'pct') {
      const fijo = ajuste.valor;
      if (!Number.isInteger(fijo) || fijo <= 0 || fijo >= 10000) return { ok: false, motivo: 'pct' };
      const repartido = repartoMayorResto(pesos, 10000 - fijo);
      pcts = originales.map(() => 0);
      pcts[i] = fijo;
      otros.forEach((k, r) => { pcts[k] = repartido[r]; });
      medios = repartoMayorResto(pcts, nC);
    } else if (ajuste.modo === 'gramos') {
      const fijo = ajuste.valor;
      if (!Number.isInteger(fijo) || fijo <= 0 || fijo >= nC) return { ok: false, motivo: 'gramos' };
      const repartido = repartoMayorResto(pesos, nC - fijo);
      medios = originales.map(() => 0);
      medios[i] = fijo;
      otros.forEach((k, r) => { medios[k] = repartido[r]; });
      pcts = repartoMayorResto(medios, 10000);
    } else {
      return { ok: false, motivo: 'modo' };
    }
  } catch {
    return { ok: false, motivo: 'reparto' };
  }
  const filas = preparada.zonas.map((z, k) => {
    const medio = medios[k];
    const min = medio - (z.medioC - z.minC);
    const max = medio + (z.maxC - z.medioC);
    return { medioC: medio, minC: min, maxC: max, minMinC: min - 20, maxMaxC: max + 20 };
  });
  return { ok: true, filas, pct: pcts, sumaC: medios.reduce((a, b) => a + b, 0), ajustado: true };
}

export const COLUMNAS_RESUMEN = [
  { id: 'hombro', titulo: 'Hombro / Superior' },
  { id: 'zona2', titulo: 'Zona 2' },
  { id: 'zona1', titulo: 'Zona 1 etiqueta' },
  { id: 'base', titulo: 'Fondo / Base' },
];

function pctDeColumna(porClave, id) {
  if (id === 'hombro') {
    if (porClave.hombro != null) return porClave.hombro;
    if (porClave.cuerpo != null) return porClave.cuerpo;
    return null;
  }
  return porClave[id] == null ? null : porClave[id];
}

export function filasResumen(doc) {
  const definir = [
    { gas: 'con_gas', titulo: 'Con gas' },
    { gas: 'sin_gas', titulo: 'Sin gas' },
  ];
  return definir.map((bloque) => {
    const filas = [];
    for (const botella of doc.botellas || []) {
      if (botella.gas !== bloque.gas) continue;
      for (const ficha of botella.fichas || []) {
        const preparada = prepararFicha(ficha);
        const porClave = {};
        preparada.zonas.forEach((z, i) => { porClave[z.clave] = preparada.pct[i]; });
        filas.push({
          id: ficha.id,
          nombre: botella.nombre,
          codigo: ficha.ficha_codigo,
          capacidad: botella.capacidad_l,
          gramajeC: preparada.sumaC,
          cortes: Array.isArray(ficha.cortes_cm) ? ficha.cortes_cm : [],
          pct: COLUMNAS_RESUMEN.map((col) => pctDeColumna(porClave, col.id)),
        });
      }
    }
    const media = COLUMNAS_RESUMEN.map((_, i) => {
      const vals = filas.map((f) => f.pct[i]).filter((v) => v != null);
      if (!vals.length) return null;
      const suma = vals.reduce((a, b) => a + b, 0);
      return { media: Math.round(suma / vals.length), n: vals.length };
    });
    return { gas: bloque.gas, titulo: bloque.titulo, filas, n: filas.length, media };
  }).filter((b) => b.n > 0);
}

const ORDEN_ZONA = ['hombro', 'zona2', 'zona1', 'base', 'cuerpo'];

export function fichasPlanas(doc) {
  const out = [];
  for (const b of doc.botellas) {
    for (const f of b.fichas) out.push({ botella: b, ficha: f, preparada: prepararFicha(f) });
  }
  return out;
}

function mediaExacta(valores) {
  // Media aritmética de los porcentajes de cada ficha (no una ratio ponderada).
  const suma = valores.reduce((a, v) => a + v.num / v.den, 0);
  return (suma / valores.length) * 100;
}

export function mediasCalculadas(planas) {
  const grupos = new Map();
  const meter = (nombre, item) => {
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre).push(item);
  };
  for (const item of planas) {
    const { ficha } = item;
    meter('GENERAL (todas las fichas)', item);
    meter(ficha.gas === 'con_gas' ? 'Con gas (todas las capacidades)' : 'Sin gas (todas las capacidades)', item);
    const cap = ficha.capacidad_l;
    const gasTxt = ficha.gas === 'con_gas' ? 'Con gas' : 'Sin gas';
    meter(`${gasTxt} · ${cap} L`, item);
    meter(`Todas · ${cap} L`, item);
    meter(`Por nº de zonas: ${ficha.n_zonas} zonas`, item);
  }
  const resultado = [];
  for (const [nombre, items] of grupos) {
    const acc = new Map();
    for (const item of items) {
      const suma = item.preparada.sumaC;
      for (const z of item.preparada.zonas) {
        if (!acc.has(z.clave)) acc.set(z.clave, []);
        acc.get(z.clave).push({ num: z.medioC, den: suma });
      }
    }
    const zonas = {};
    for (const [clave, vals] of acc) {
      zonas[clave] = { media: mediaExacta(vals), n: vals.length };
    }
    resultado.push({ grupo: nombre, n_fichas: items.length, zonas });
  }
  return resultado;
}

export function nombreZonaVisible(clave) {
  return {
    hombro: 'Hombro',
    zona2: 'Zona 2',
    zona1: 'Zona 1',
    base: 'Base / Fondo',
    cuerpo: 'Cuerpo',
  }[clave] || clave;
}

export { ORDEN_ZONA };
