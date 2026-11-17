export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function compactar(s) {
  return normalizar(s).replace(/[^a-z0-9]+/g, '');
}

/** Número solo para colocar un marcador. El texto visible sigue siendo el original. */
export function parseNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function enteroPlano(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

export function etiquetaGrupo(grupo) {
  if (grupo === 'Asépticos') return 'Asépticos';
  if (grupo === 'No asépticos') return 'Carbonatados';
  return grupo || '—';
}

export function esCodigoG(s) {
  return /^G\d+$/i.test(String(s || '').trim());
}

/** Clave de filtro: misma marca si solo cambian mayúsculas o tildes. */
export function claveMarca(marca) {
  return normalizar(marca).replace(/\s+/g, ' ').trim();
}

function esTodoMayusculas(s) {
  const letras = String(s).match(/\p{L}/gu) || [];
  return letras.length > 0 && letras.every((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase());
}

export function agruparMarcas(productos) {
  const grupos = new Map();
  for (const p of productos) {
    const nombre = p.marca;
    if (nombre == null || nombre === '') continue;
    const clave = claveMarca(nombre);
    if (!grupos.has(clave)) grupos.set(clave, new Map());
    const vars = grupos.get(clave);
    vars.set(nombre, (vars.get(nombre) || 0) + 1);
  }
  const out = [];
  for (const [clave, vars] of grupos) {
    const variantes = [...vars.entries()]
      .map(([nombre, n]) => ({ nombre, n }))
      .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
    const legible = variantes.find((v) => !esTodoMayusculas(v.nombre));
    const total = variantes.reduce((s, v) => s + v.n, 0);
    out.push({
      clave,
      etiqueta: (legible || variantes[0]).nombre,
      total,
      variantes,
    });
  }
  out.sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  return out;
}

export function tieneDatos(fila) {
  if (!fila || typeof fila !== 'object') return false;
  return Object.keys(fila).some((k) => k !== 'etiqueta' && fila[k] != null && fila[k] !== '');
}

export function boolTexto(v) {
  return v ? 'Sí' : 'No';
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_ABBR = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

export function fechaPaquete(formato) {
  const bruto = formato?.datos_generados || formato?.generado || '';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(bruto);
  if (!m) return bruto;
  const mes = MESES[Number(m[2]) - 1] || m[2];
  return `${Number(m[3])} de ${mes} de ${m[1]}, ${m[4]}:${m[5]}`;
}

export function ordenFecha(s) {
  const m = /^(\d{1,2})-([a-záéíóúñ]+)\.?-(\d{2})$/i.exec(String(s || '').replace(/\s/g, ''));
  if (!m) return 0;
  const mon = MES_ABBR[m[2].toLowerCase().slice(0, 3)];
  if (mon == null) return 0;
  const yy = Number(m[3]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return Date.UTC(year, mon, Number(m[1]));
}

export const TIPO_INC = {
  rango_incoherente_en_pdf: 'Rango incoherente en el PDF',
  sap_mezcla_no_es_codigo_G: 'SAP Mezcla no es un código G',
  error_plantilla_access: 'Error de plantilla Access',
  texto_excede_casilla: 'El texto no cabe en la casilla',
  valor_no_numerico_en_pdf: 'Valor no numérico en el PDF',
  paletizacion_no_cuadra: 'La paletización no cuadra',
};

export const CASILLAS = [
  ['etiqueta', 'Diseño etiqueta/lata'],
  ['mosaico', 'Mosaico de paletización'],
  ['bandeja', 'Diseño bandeja'],
  ['botella', 'Diseño botella'],
  ['etiqueta_palet', 'Etiqueta palet'],
  ['retractil_et_paquete', 'Retráctil / etiqueta de paquete'],
  ['etiqueta_caja', 'Etiqueta caja'],
  ['asa', 'Diseño asa'],
  ['tapon', 'Diseño tapón/tapa'],
];

export const EAN_CLAVES = ['etiqueta_ean', 'cluster_ean', 'retrac_ean', 'et_caja_ean', 'et_palet_ean', 'bandeja_ean'];

const TRAZOS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.8V20h12v-9.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  layers: '<path d="m12 3 9 5-9 5L3 8l9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  compare: '<path d="M8 4v16"/><path d="M16 4v16"/><path d="M4 8h4"/><path d="M16 8h4"/><path d="M4 16h4"/><path d="M16 16h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  print: '<path d="M6 9V4h12v5"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="6"/>',
  warning: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
  bottle: '<path d="M10 2h4v3l2 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V8l2-3V2Z"/>',
  pallet: '<path d="M3 15h18"/><path d="M4 15v4"/><path d="M20 15v4"/><path d="M12 15v4"/><rect x="4" y="6" width="16" height="4"/><rect x="6" y="10" width="12" height="5"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6L5 19a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 19l-5-10V3"/>',
  leaf: '<path d="M5 19c8 0 14-8 14-14-6 0-14 6-14 14Z"/><path d="M8 16c2-2 5-5 8-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6"/>',
  micro: '<circle cx="9" cy="10" r="3"/><circle cx="15" cy="14" r="2"/><circle cx="14" cy="7" r="1.4"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-4-4 3-2-1.5L3 18"/>',
  users: '<circle cx="9" cy="9" r="3"/><path d="M3 19c.6-2.6 2.8-4 6-4s5.4 1.4 6 4"/><circle cx="17" cy="9" r="2.2"/><path d="M16 15.2c1.8.2 3.2 1.2 3.8 3.3"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
  logout: '<path d="M10 7V5H5v14h5v-2"/><path d="M10 12h9"/><path d="m16 9 3 3-3 3"/>',
  install: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 8h.01"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4V8Z"/><circle cx="12" cy="13" r="3.2"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.8 6.6 19.8l1-6.1L3.2 9.4l6.1-.9L12 3Z"/>',
  share: '<circle cx="6" cy="12" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="m8 11 7-3M8 13l7 3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
};

export function icono(nombre) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TRAZOS[nombre] || TRAZOS.info}</svg>`;
}

export const CABECERA = [
  ['fecha', 'Fecha'],
  ['edicion', 'Edición'],
  ['n_pagina_ficha', 'Nº de página de ficha'],
  ['marca', 'Marca'],
  ['formato', 'Formato'],
  ['consumo_preferente', 'Consumo preferente'],
  ['sap_mezcla_casilla_2', 'SAP Mezcla (2ª casilla)'],
  ['relacion_jarabe', 'Relación jarabe'],
  ['codificacion_envase', 'Codificación envase'],
  ['n_producto_ean128', 'Nº producto para EAN 128'],
];

export const ENVASE = [
  ['peso_preforma_g', 'Peso preforma (g)'],
  ['color_preforma', 'Color preforma'],
  ['envase', 'Envase'],
  ['tipo_tapon', 'Tipo tapón'],
  ['asa', 'Asa'],
  ['pajita', 'Pajita'],
  ['posicion_pajita', 'Posición pajita'],
  ['bandeja', 'Bandeja'],
  ['codifica_bandeja', 'Codifica bandeja'],
  ['plastico_estirable', 'Plástico estirable'],
  ['retractilado_bandeja', 'Retractilado bandeja'],
];

export const PALET_CAMPOS = [
  ['tipo_palet', 'Tipo palet'],
  ['agrupacion', 'Agrupación'],
  ['n_capas', 'Nº capas'],
  ['cajas_palet', 'Cajas/palet'],
  ['uds_caja', 'Uds/caja'],
  ['uds_palet', 'Uds/palet'],
];

export const TABLAS = [
  { id: 'datos_jarabe', titulo: 'Datos del jarabe', icono: 'drop', nota: 'Std. es el objetivo. Máx. y Mín. son los límites del PDF. Una casilla ausente estaba vacía: no es cero.' },
  { id: 'producto_terminado', titulo: 'Producto terminado', icono: 'flask', nota: 'Los rótulos (por ejemplo el método de CO2 o la densidad 20/4 o 20/20) son los de esta ficha.' },
  { id: 'proceso', titulo: 'Proceso', icono: 'gear', nota: '' },
  { id: 'microbiologia', titulo: 'Microbiología', icono: 'micro', nota: 'Valores máximos, tal como vienen en la ficha.' },
  { id: 'alergenos_claims', titulo: 'Alérgenos y claims', icono: 'leaf', nota: 'En el PDF el bloque se titula «ALÉREGNOS» (errata de origen). Aquí se rotula Alérgenos.' },
  { id: 'limites_cliente', titulo: 'Límites cliente', icono: 'users', nota: 'El PDF no encabeza estas dos casillas. No se interpretan como máximo ni mínimo.' },
];

export const DISENO_GRUPOS = [
  { titulo: 'Etiqueta / lata', campos: [['etiqueta_ean', 'EAN'], ['etiqueta_version', 'Versión'], ['etiqueta_version_casilla_2', 'Versión (2ª casilla)']] },
  { titulo: 'Botella', campos: [['botella_tipo', 'Tipo']] },
  { titulo: 'Tapón / tapa', campos: [['tapon_sap', 'SAP'], ['tapon_sap_casilla_2', 'SAP (2ª casilla)']] },
  { titulo: 'Cluster', campos: [['cluster_ean', 'EAN'], ['cluster_version', 'Versión']] },
  { titulo: 'Asa', campos: [['asa_n', 'N. ASA']] },
  { titulo: 'Separador', campos: [['separador', 'Separador']] },
  { titulo: 'Retráctil / etiqueta de paquete', campos: [['retrac_ean', 'EAN'], ['retrac_version', 'Versión'], ['retrac_version_casilla_2', 'Versión (2ª casilla)']] },
  { titulo: 'Etiqueta de caja', campos: [['et_caja_ean', 'EAN'], ['et_caja_version', 'Versión']] },
  { titulo: 'Etiqueta de palet', campos: [['et_palet_ean', 'EAN'], ['et_palet_version', 'Versión']] },
  { titulo: 'Bandeja', campos: [['bandeja_ean', 'EAN'], ['bandeja_version', 'Versión'], ['bandeja_version_casilla_2', 'Versión (2ª casilla)']] },
  { titulo: 'Validación', campos: [['validado_ficha_cliente', 'Validado con ficha cliente'], ['creado_por', 'Creado por'], ['validado_por', 'Validado por']] },
];
