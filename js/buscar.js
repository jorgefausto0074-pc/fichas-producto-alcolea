import { claveMarca, compactar, normalizar, EAN_CLAVES } from './util.js';

export function eansDe(p) {
  const d = p.diseno || {};
  const out = [];
  for (const k of EAN_CLAVES) {
    if (d[k]) out.push(String(d[k]));
  }
  if (p.n_producto_ean128) out.push(String(p.n_producto_ean128));
  return out;
}

function textoBusqueda(p) {
  return normalizar([
    p.producto,
    p.marca,
    p.formato,
    p.familia_derivada,
    p.grupo_pdf,
    p.sap_mezcla,
    p.sap_mezcla_casilla_2,
    p.codigo_sap,
    p.observaciones,
    p.tipo_tapon,
    p.bandeja,
    ...eansDe(p),
  ].filter(Boolean).join(' '));
}

function distancia(a, b) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  if (Math.abs(la - lb) > 2) return 3;
  const prev = new Array(lb + 1);
  const cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j += 1) prev[j] = j;
  for (let i = 1; i <= la; i += 1) {
    cur[0] = i;
    let mejor = cur[0];
    for (let j = 1; j <= lb; j += 1) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + coste);
      if (cur[j] < mejor) mejor = cur[j];
    }
    if (mejor > 2) return 3;
    for (let j = 0; j <= lb; j += 1) prev[j] = cur[j];
  }
  return prev[lb];
}

export function puntuacion(p, qRaw) {
  const q = normalizar(qRaw).trim();
  if (!q) return 1;
  const compacto = compactar(q);
  const sap = compactar(p.codigo_sap);
  const mezcla = compactar(p.sap_mezcla);
  const mezcla2 = compactar(p.sap_mezcla_casilla_2);

  if (compacto && sap === compacto) return 1000;
  if (compacto && mezcla && mezcla === compacto) return 940;
  if (compacto && mezcla2 && mezcla2 === compacto) return 930;
  if (compacto && sap.startsWith(compacto)) return 820 - Math.min(sap.length - compacto.length, 20);
  if (compacto.length >= 3 && mezcla.includes(compacto)) return 760;
  if (compacto.length >= 4 && sap.includes(compacto)) return 740;

  const eans = eansDe(p).map((e) => compactar(e));
  if (compacto && eans.some((e) => e === compacto)) return 900;
  if (compacto.length >= 4 && eans.some((e) => e.includes(compacto))) return 720;

  const blob = textoBusqueda(p);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every((t) => blob.includes(t))) {
    return 520 + Math.min(compacto.length, 40);
  }

  const ptokens = normalizar(`${p.producto || ''} ${p.marca || ''}`)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  let aciertos = 0;
  for (const t of tokens) {
    if (t.length < 4) continue;
    const ok = ptokens.some((pt) => {
      if (pt.includes(t) || t.includes(pt)) return true;
      const limite = t.length >= 8 ? 2 : 1;
      return distancia(pt, t) <= limite || distancia(pt.slice(0, Math.min(pt.length, t.length + 1)), t) <= limite;
    });
    if (ok) aciertos += 1;
  }
  const exigidos = tokens.filter((t) => t.length >= 4);
  if (exigidos.length && aciertos === exigidos.length) return 300;
  return 0;
}

export function filtrar(productos, { q = '', grupo = '', formato = '', familia = '', marca = '', inc = false } = {}) {
  let list = productos;
  if (grupo === 'asepticos') list = list.filter((p) => p.grupo_pdf === 'Asépticos');
  else if (grupo === 'carbonatados') list = list.filter((p) => p.grupo_pdf === 'No asépticos');
  if (formato) list = list.filter((p) => p.formato === formato);
  if (familia) list = list.filter((p) => p.familia_derivada === familia);
  if (marca) {
    const clave = claveMarca(marca);
    list = list.filter((p) => claveMarca(p.marca) === clave);
  }
  if (inc) list = list.filter((p) => p.incidencias?.length);
  const consulta = String(q || '').trim();
  if (!consulta) {
    return list.slice().sort((a, b) => a.producto.localeCompare(b.producto, 'es') || a.codigo_sap.localeCompare(b.codigo_sap));
  }
  const scored = [];
  for (const p of list) {
    const s = puntuacion(p, consulta);
    if (s > 0) scored.push([s, p]);
  }
  const numerica = /^\d+$/.test(compactar(consulta));
  scored.sort((a, b) => {
    if (b[0] !== a[0]) return b[0] - a[0];
    if (numerica) return a[1].codigo_sap.localeCompare(b[1].codigo_sap);
    return a[1].producto.localeCompare(b[1].producto, 'es');
  });
  return scored.map((x) => x[1]);
}

export function contarValores(productos, clave) {
  const m = new Map();
  for (const p of productos) {
    const v = p[clave];
    if (v == null || v === '') continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'));
}
