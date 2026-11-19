// Índice de materiales auxiliares (tapón, etiqueta, bandeja…) a partir de p.diseno.
// Se calcula en el dispositivo con los datos ya descifrados: no hay ningún índice en claro.
import { claveMarca, compactar, agruparMarcas, etiquetaGrupo } from './util.js';

/** [campo de p.diseno, tipo de material, rótulo del campo en la ficha] */
export const CAMPOS_MATERIAL = [
  ['tapon_sap', 'Tapón', 'SAP tapón'],
  ['tapon_sap_casilla_2', 'Tapón', 'SAP tapón (2ª casilla)'],
  ['etiqueta_version', 'Etiqueta', 'Versión etiqueta'],
  ['etiqueta_version_casilla_2', 'Etiqueta', 'Versión etiqueta (2ª casilla)'],
  ['etiqueta_ean', 'Etiqueta', 'EAN etiqueta'],
  ['bandeja_version', 'Bandeja', 'Versión bandeja'],
  ['bandeja_version_casilla_2', 'Bandeja', 'Versión bandeja (2ª casilla)'],
  ['bandeja_ean', 'Bandeja', 'EAN bandeja'],
  ['retrac_version', 'Retráctil', 'Versión retráctil'],
  ['retrac_version_casilla_2', 'Retráctil', 'Versión retráctil (2ª casilla)'],
  ['retrac_ean', 'Retráctil', 'EAN retráctil'],
  ['separador', 'Separador', 'Separador'],
  ['asa_n', 'Asa', 'N. ASA (EAN)'],
  ['et_palet_ean', 'Etiqueta de palet', 'EAN etiqueta palet'],
  ['et_palet_version', 'Etiqueta de palet', 'Versión etiqueta palet'],
  ['et_caja_ean', 'Etiqueta de caja', 'EAN etiqueta caja'],
  ['et_caja_version', 'Etiqueta de caja', 'Versión etiqueta caja'],
  ['cluster_ean', 'Cluster', 'EAN cluster'],
  ['cluster_version', 'Cluster', 'Versión cluster'],
];

/**
 * Descripción de cada código según el apartado «Envase y embalaje» (página 1) de la misma ficha.
 * [campo de p.diseno, campo de la página 1 que lo describe]. Solo la 1ª casilla del tapón: la 2ª es otro
 * código y la ficha solo trae un «TipoTapón». Etiquetas, retráctil, palet… no tienen descripción en la ficha.
 */
export const DESCRIPCION_CAMPO = {
  tapon_sap: 'tipo_tapon',
  asa_n: 'asa',
  bandeja_version: 'bandeja',
  bandeja_version_casilla_2: 'bandeja',
  bandeja_ean: 'bandeja',
};
/** Rótulo del campo de la página 1 de donde sale la descripción. */
export const ROTULO_DESCRIPCION = { tipo_tapon: 'TipoTapón', asa: 'Asa', bandeja: 'Bandeja' };
/** Asa con su código SAP escrito dentro de «Asa:» (p. ej. «Decorada - SAP: 4006272»). */
const RE_SAP_ASA = /\b(400\d{4})\b/g;
const ROTULO_SAP_ASA = 'SAP asa (en «Asa:» de envase)';

/** Texto descriptivo útil: sin vacíos, guiones ni «Sí»/«No». */
export function descripcionUtil(v) {
  const s = valorMaterial(v);
  if (!s || /^(s[ií]|no)$/i.test(s)) return '';
  return s;
}

/** Descripción de un código en una ficha concreta (o '' si la ficha no la trae). */
export function descripcionEnFicha(p, campos) {
  for (const c of campos) {
    if (c === ROTULO_SAP_ASA) return descripcionUtil(p.asa);
    const campo = CAMPO_POR_ROTULO.get(c);
    const fuente = campo && DESCRIPCION_CAMPO[campo];
    const d = fuente ? descripcionUtil(p[fuente]) : '';
    if (d) return d;
  }
  return '';
}

export const TIPOS_MATERIAL = ['Tapón', 'Etiqueta', 'Bandeja', 'Retráctil', 'Separador', 'Asa', 'Etiqueta de palet', 'Etiqueta de caja', 'Cluster'];

/** Casilla de imagen de la página 2 que dibuja cada tipo. Separador y cluster no traen dibujo. */
export const FOTO_TIPO = {
  'Tapón': ['tapon', 'Diseño tapón/tapa'],
  'Etiqueta': ['etiqueta', 'Diseño etiqueta/lata'],
  'Bandeja': ['bandeja', 'Diseño bandeja'],
  'Retráctil': ['retractil_et_paquete', 'Retráctil / etiqueta de paquete'],
  'Asa': ['asa', 'Diseño asa'],
  'Etiqueta de palet': ['etiqueta_palet', 'Etiqueta palet'],
  'Etiqueta de caja': ['etiqueta_caja', 'Etiqueta caja'],
};

const CAMPO_POR_ROTULO = new Map(CAMPOS_MATERIAL.map(([campo, , rotulo]) => [rotulo, campo]));

const ORDEN_TIPO = new Map(TIPOS_MATERIAL.map((t, i) => [t, i]));
export const ordenTipo = (t) => ORDEN_TIPO.get(t) ?? 99;

/** Valor de casilla utilizable: sin vacíos ni guiones («-», «--»). El texto se conserva tal cual. */
export function valorMaterial(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || /^-+$/.test(s)) return '';
  return s;
}

const sinCeros = (s) => s.replace(/^0+(?=\d)/, '');

/**
 * Map código → { codigo, clave, tipos: Map tipo → Map sap → { p, campos: [rótulo…] } , n }
 * n = productos distintos con ese código (en cualquier tipo).
 */
export function indexarMateriales(productos) {
  const idx = new Map();
  for (const p of productos) {
    const d = p.diseno || {};
    const entradas = CAMPOS_MATERIAL.map(([campo, tipo, rotulo]) => [valorMaterial(d[campo]), tipo, rotulo]);
    for (const [, sapAsa] of String(p.asa || '').matchAll(RE_SAP_ASA)) entradas.push([sapAsa, 'Asa', ROTULO_SAP_ASA]);
    for (const [codigo, tipo, rotulo] of entradas) {
      if (!codigo) continue;
      let m = idx.get(codigo);
      if (!m) {
        m = { codigo, clave: compactar(codigo), tipos: new Map(), saps: new Set() };
        idx.set(codigo, m);
      }
      if (!m.tipos.has(tipo)) m.tipos.set(tipo, new Map());
      const porSap = m.tipos.get(tipo);
      if (!porSap.has(p.codigo_sap)) porSap.set(p.codigo_sap, { p, campos: [] });
      const e = porSap.get(p.codigo_sap);
      if (!e.campos.includes(rotulo)) e.campos.push(rotulo);
      m.saps.add(p.codigo_sap);
    }
  }
  const porClave = new Map();
  for (const m of idx.values()) {
    m.n = m.saps.size;
    m.descripciones = new Map();
    for (const [tipo, porSap] of m.tipos) {
      const d = describir(porSap);
      if (d) m.descripciones.set(tipo, d);
    }
    m.tipos = new Map([...m.tipos.entries()].sort((a, b) => ordenTipo(a[0]) - ordenTipo(b[0])));
    if (!porClave.has(m.clave)) porClave.set(m.clave, m);
    const sc = sinCeros(m.clave);
    if (sc !== m.clave && !porClave.has(sc)) porClave.set(sc, m);
  }
  return { porCodigo: idx, porClave, lista: [...idx.values()] };
}

/**
 * Descripción de un código dentro de un tipo: la más frecuente entre sus fichas y las variantes.
 * { texto, n, total, variantes: [{ texto, n }], fuente } o null si ninguna ficha la trae. No se inventa nada.
 */
export function describir(porSap) {
  const cuenta = new Map();
  let fuente = '';
  for (const e of porSap.values()) {
    const t = descripcionEnFicha(e.p, e.campos);
    if (!t) continue;
    cuenta.set(t, (cuenta.get(t) || 0) + 1);
    if (!fuente) {
      const c = e.campos.find((x) => x === ROTULO_SAP_ASA || DESCRIPCION_CAMPO[CAMPO_POR_ROTULO.get(x)]);
      fuente = c === ROTULO_SAP_ASA ? 'Asa' : ROTULO_DESCRIPCION[DESCRIPCION_CAMPO[CAMPO_POR_ROTULO.get(c)]] || '';
    }
  }
  if (!cuenta.size) return null;
  const orden = [...cuenta.entries()].map(([texto, n]) => ({ texto, n }))
    .sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto, 'es'));
  return { texto: orden[0].texto, n: orden[0].n, total: [...cuenta.values()].reduce((a, b) => a + b, 0), variantes: orden.slice(1), fuente };
}

/** «Tapón · AMARILLO ANONIMO» para listas cortas (sugerencias, materiales compartidos). */
export function textoDescripcion(m, tipo) {
  const d = m.descripciones?.get(tipo);
  if (!d) return '';
  return d.variantes.length ? `${d.texto} (+${d.variantes.length} variante${d.variantes.length === 1 ? '' : 's'})` : d.texto;
}

/** Material exacto para una consulta (sin espacios ni signos, y tolera ceros a la izquierda). */
export function materialExacto(ix, q, { minimo = 3 } = {}) {
  const c = compactar(q);
  if (!c || c.length < minimo) return null;
  return ix.porCodigo.get(String(q).trim()) || ix.porClave.get(c) || ix.porClave.get(sinCeros(c)) || null;
}

export function resumenTipos(m) {
  return [...m.tipos.entries()].map(([tipo, porSap]) => ({ tipo, n: porSap.size }));
}

/** Sugerencias mientras se escribe: primero los que empiezan por lo escrito, luego los que lo contienen. */
export function sugerirMateriales(ix, q, limite = 8) {
  const c = compactar(q);
  if (c.length < 3 || !/\d/.test(c)) return { items: [], total: 0 };
  const empiezan = [];
  const contienen = [];
  for (const m of ix.lista) {
    if (m.clave.startsWith(c)) empiezan.push(m);
    else if (c.length >= 4 && m.clave.includes(c)) contienen.push(m);
  }
  const orden = (a, b) => (a.clave === c ? -1 : 0) - (b.clave === c ? -1 : 0) || b.n - a.n || a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
  empiezan.sort(orden);
  contienen.sort(orden);
  const todos = empiezan.concat(contienen);
  return { items: todos.slice(0, limite), total: todos.length };
}

/** Etiqueta de marca unificada (la misma de los filtros) para cada clave. */
export function etiquetasMarca(productos) {
  const m = new Map();
  for (const g of agruparMarcas(productos)) m.set(g.clave, g.etiqueta);
  return m;
}

/** Productos de un tipo agrupados por marca unificada. */
export function porMarca(porSap, etiquetas) {
  const grupos = new Map();
  for (const e of porSap.values()) {
    const marca = e.p.marca == null || e.p.marca === '' ? '' : claveMarca(e.p.marca);
    if (!grupos.has(marca)) grupos.set(marca, { clave: marca, etiqueta: marca ? (etiquetas.get(marca) || e.p.marca) : 'Sin marca', items: [] });
    grupos.get(marca).items.push(e);
  }
  const out = [...grupos.values()];
  for (const g of out) g.items.sort((a, b) => a.p.codigo_sap.localeCompare(b.p.codigo_sap, 'es', { numeric: true }));
  out.sort((a, b) => b.items.length - a.items.length || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  return out;
}

/** Fotos distintas del dibujo del tipo entre los productos que llevan el material, la más frecuente primero. */
export function fotosMaterial(tipo, porSap) {
  const f = FOTO_TIPO[tipo];
  if (!f) return { casilla: '', fotos: [] };
  const [casilla] = f;
  const porHash = new Map();
  for (const e of porSap.values()) {
    const h = e.p.imagenes_sha256?.[casilla];
    if (!h) continue;
    if (!porHash.has(h)) porHash.set(h, []);
    porHash.get(h).push(e.p);
  }
  const fotos = [...porHash.entries()].map(([hash, ps]) => ({ hash, productos: ps.sort((a, b) => a.codigo_sap.localeCompare(b.codigo_sap)) }));
  fotos.sort((a, b) => b.productos.length - a.productos.length || a.productos[0].codigo_sap.localeCompare(b.productos[0].codigo_sap));
  return { casilla, fotos };
}

/** Códigos que llevan `minimo` o más productos dentro del mismo tipo (2 = compartidos). */
export function materialesCompartidos(ix, minimo = 2) {
  const out = [];
  for (const m of ix.lista) {
    for (const [tipo, porSap] of m.tipos) {
      if (porSap.size >= minimo) out.push({ codigo: m.codigo, tipo, n: porSap.size, m });
    }
  }
  out.sort((a, b) => b.n - a.n || ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  return out;
}

export const COLUMNAS_EXCEL = [
  ['Tipo de material', 18], ['Campo de la ficha', 20], ['Código', 18], ['Marca', 22], ['SAP', 11],
  ['Producto', 52], ['Formato', 14], ['Familia', 22], ['Grupo', 14], ['Descripción (envase y embalaje)', 34],
];

/** Filas del Excel: una por producto y tipo, en el mismo orden que la pantalla. */
export function filasMaterial(m, etiquetas, soloTipo = '') {
  const filas = [];
  for (const [tipo, porSap] of m.tipos) {
    if (soloTipo && tipo !== soloTipo) continue;
    for (const g of porMarca(porSap, etiquetas)) {
      for (const e of g.items) {
        const p = e.p;
        filas.push([tipo, e.campos.join(', '), m.codigo, g.etiqueta, p.codigo_sap, p.producto || '', p.formato || '', p.familia_derivada || '', etiquetaGrupo(p.grupo_pdf), descripcionEnFicha(p, e.campos)]);
      }
    }
  }
  return filas;
}

/** Nombre de archivo corto y seguro: MATERIAL_<código>.xlsx */
export function nombreSeguro(base, codigo = '') {
  const c = String(codigo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${base}${c ? `_${c}` : ''}.xlsx`;
}
