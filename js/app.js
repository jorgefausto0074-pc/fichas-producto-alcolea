import { derivarClave, descifrarConClave } from './descifrar.js';
import { guardarClave, leerClave, borrarClave } from './sesion.js';
import { obtenerFormato, obtenerCifrado, indexar } from './cargar.js';
import { filtrar } from './buscar.js';
import { agruparMarcas, compactar, esCodigoG, fechaPaquete, ordenFecha, CASILLAS } from './util.js';
import { contarValores } from './buscar.js';
import {
  htmlLogin, htmlShell, htmlInicio, htmlBuscar, htmlResultados, htmlProducto,
  htmlComparar, htmlCodigos, htmlCodigoG, htmlLightbox, htmlDock,
  htmlNovedades, htmlResultadoEan, htmlEscaner, htmlCompartir, htmlActualizar,
  htmlMaterial, htmlMaterialesParciales, htmlSugerencias, htmlMateriales,
} from './vistas.js';
import {
  indexarMateriales, materialExacto, sugerirMateriales, resumenTipos, etiquetasMarca, porMarca,
  fotosMaterial, materialesCompartidos, filasMaterial, nombreSeguro, COLUMNAS_EXCEL, FOTO_TIPO, ordenTipo,
} from './materiales.js';
import { libroXlsx, XLSX_MIME } from './excel.js';
import { fichasPorEan } from './ean.js';
import { decodificarCanvas } from './escaner.js';
import {
  favoritos, toggleFavorito, limpiarFavoritos, recientes, anotarReciente,
  limpiarRecientes, fijarPlanta, aplicarPlantaGuardada, esFavorito,
} from './preferencias.js';
import { juzgarMedida, textoJuicio } from './analisis.js';
import { borrarAccesoEnvuelto, descargarAcceso, desenvolverToken, envolverToken } from './acceso.js';
import { crearCliente } from './github.js';
import {
  aprobar, descartar, informeDeRelease, leerPdfs, leerResultado, mensajeFallo,
  nuevaSolicitud, sanear, seguir, subirRevision,
} from './actualizar.js';

aplicarPlantaGuardada();
const state = {
  formato: null,
  doc: null,
  imagenes: null,
  blob: null,
  porSap: new Map(),
  porMezcla: new Map(),
  listo: false,
  ruta: { vista: 'inicio' },
  q: '',
  qG: '',
  filtros: filtroVacio(),
  comparar: [],
  limite: 48,
  vacios: false,
  errorLogin: '',
  ocupado: false,
  lb: null,
  galeriaActual: [],
  installEvent: null,
  swReg: null,
  hayActualizacion: false,
  mat: null,
  etMarca: new Map(),
  qM: '',
  tipoM: '',
  matTodos: false,
  sug: { items: [], total: 0, activa: -1, q: '' },
};

const urls = new Map();
let claveAplicacion = '';
let acceso = null;
let actGeneracion = 0;
let pantallaActLista = false;
const act = {
  fase: 'clave',
  error: '',
  texto: '',
  runUrl: '',
  ocupado: false,
  informe: null,
  solicitud: '',
  desde: '',
};
const CLAVE_ACT = 'fichas-act-estado';
let io = null;
let vistaFirma = '';
let toastTimer = 0;
const detallesAntes = new Map();

function filtroVacio() {
  return { grupo: '', formato: '', familia: '', marca: '', inc: false };
}

function modificado(ev) {
  return ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0;
}

function esCampo(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function construirUrl() {
  const p = new URLSearchParams();
  const r = state.ruta;
  if (r.vista === 'producto' && r.sap) p.set('sap', r.sap);
  else if (r.vista === 'g' && r.codigo) p.set('g', r.codigo);
  else if (r.vista === 'codigos') {
    p.set('vista', 'codigos-g');
    if (state.qG) p.set('qg', state.qG);
  } else if (r.vista === 'comparar') {
    p.set('vista', 'comparar');
    if (state.comparar.length) p.set('cmp', state.comparar.join(','));
  } else if (r.vista === 'novedades') p.set('vista', 'novedades');
  else if (r.vista === 'actualizar') p.set('vista', 'actualizar');
  else if (r.vista === 'ean' && r.codigo) p.set('ean', r.codigo);
  else if (r.vista === 'material' && r.codigo) p.set('mat', r.codigo);
  else if (r.vista === 'materiales') {
    p.set('vista', 'materiales');
    if (state.qM) p.set('qm', state.qM);
    if (state.tipoM) p.set('tipo', state.tipoM);
    if (state.matTodos) p.set('todos', '1');
  }
  else if (r.vista === 'buscar') {
    p.set('vista', 'buscar');
    if (state.q) p.set('q', state.q);
    const f = state.filtros;
    if (f.grupo) p.set('grupo', f.grupo);
    if (f.formato) p.set('formato', f.formato);
    if (f.familia) p.set('familia', f.familia);
    if (f.marca) p.set('marca', f.marca);
    if (f.inc) p.set('inc', '1');
  }
  const qs = p.toString();
  return `${location.pathname}${qs ? `?${qs}` : ''}`;
}

function leerRuta() {
  const q = new URLSearchParams(location.search);
  const sap = (q.get('sap') || '').trim();
  const g = (q.get('g') || '').trim();
  if (sap) return { vista: 'producto', sap };
  if (g) return { vista: 'g', codigo: g };
  const ean = (q.get('ean') || '').trim();
  if (ean) return { vista: 'ean', codigo: ean };
  const mat = (q.get('mat') || '').trim();
  if (mat) return { vista: 'material', codigo: mat };
  const vista = q.get('vista');
  if (vista === 'materiales') {
    state.qM = q.get('qm') || '';
    state.tipoM = q.get('tipo') || '';
    state.matTodos = q.get('todos') === '1';
    return { vista: 'materiales' };
  }
  if (vista === 'novedades') return { vista: 'novedades' };
  if (vista === 'actualizar') return { vista: 'actualizar' };
  if (vista === 'comparar') {
    const cmp = (q.get('cmp') || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (cmp.length) state.comparar = cmp.slice(0, 3);
    return { vista: 'comparar' };
  }
  if (vista === 'codigos-g') {
    state.qG = q.get('qg') || '';
    return { vista: 'codigos' };
  }
  if (vista === 'buscar' || q.get('q') || q.get('grupo') || q.get('formato') || q.get('familia') || q.get('marca') || q.get('inc')) {
    state.q = q.get('q') || '';
    state.filtros = {
      grupo: q.get('grupo') || '',
      formato: q.get('formato') || '',
      familia: q.get('familia') || '',
      marca: q.get('marca') || '',
      inc: q.get('inc') === '1',
    };
    return { vista: 'buscar' };
  }
  state.q = '';
  state.filtros = filtroVacio();
  return { vista: 'inicio' };
}

function guardarCmp() {
  try { sessionStorage.setItem('fichas-pt-cmp', state.comparar.join(',')); } catch { /* privado */ }
}

function restaurarCmp() {
  if (state.comparar.length) return;
  try {
    const raw = sessionStorage.getItem('fichas-pt-cmp') || '';
    state.comparar = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  } catch { /* privado */ }
}

function productos() {
  return state.doc?.productos || [];
}

function ctxBuscar() {
  let resultados = filtrar(productos(), { q: state.q, ...state.filtros });
  let bloqueMaterial = '';
  let bloqueParcial = '';
  const exacto = state.q && state.mat ? materialExacto(state.mat, state.q) : null;
  if (exacto) {
    bloqueMaterial = htmlMaterial({ codigo: exacto.codigo, m: exacto, tipos: vistaMaterial(exacto), enLinea: true });
    resultados = resultados.filter((p) => !exacto.saps.has(p.codigo_sap));
  } else if (state.q && state.mat) {
    const s = sugerirMateriales(state.mat, state.q, 12);
    if (s.items.length) bloqueParcial = htmlMaterialesParciales({ q: state.q, items: s.items.map(conTextoTipos), total: s.total });
  }
  return {
    q: state.q,
    filtros: state.filtros,
    resultados,
    bloqueMaterial,
    bloqueParcial,
    hayMaterial: Boolean(exacto),
    total: resultados.length,
    limite: state.limite,
    avisoMezcla: mezclaDeConsulta(state.q),
    formatos: contarValores(productos(), 'formato'),
    familias: contarValores(productos(), 'familia_derivada'),
    marcas: agruparMarcas(productos()),
    nInc: productos().filter((p) => p.incidencias?.length).length,
  };
}

function mezclaDeConsulta(q) {
  const c = compactar(q);
  if (c.length < 3) return null;
  for (const [k, arr] of state.porMezcla) {
    if (compactar(k) === c) return { codigo: k, n: arr.length };
  }
  return null;
}

function productosMezcla(codigo) {
  if (state.porMezcla.has(codigo)) return { codigo, productos: state.porMezcla.get(codigo) };
  const c = compactar(codigo);
  for (const [k, arr] of state.porMezcla) {
    if (compactar(k) === c) return { codigo: k, productos: arr };
  }
  return { codigo, productos: null };
}

function urlDeHash(hash) {
  if (!hash) return null;
  if (urls.has(hash)) return urls.get(hash);
  const m = state.imagenes?.[hash];
  if (!m) return null;
  const blob = new Blob([state.blob.subarray(m.offset, m.offset + m.longitud)], { type: m.mime || 'image/jpeg' });
  const meta = { url: URL.createObjectURL(blob), ancho: m.ancho, alto: m.alto, hash };
  urls.set(hash, meta);
  recortarMargen(blob).then((recorte) => {
    if (!recorte || !urls.has(hash)) return;
    const nuevo = URL.createObjectURL(recorte.blob);
    const anterior = meta.url;
    meta.url = nuevo;
    meta.ancho = recorte.ancho;
    meta.alto = recorte.alto;
    state.galeriaActual.forEach((item) => {
      if (item.hash === hash) {
        item.url = nuevo;
        item.ancho = recorte.ancho;
        item.alto = recorte.alto;
      }
    });
    document.querySelectorAll(`img[data-hash="${hash}"]`).forEach((img) => {
      img.src = nuevo;
      img.width = recorte.ancho;
      img.height = recorte.alto;
    });
    URL.revokeObjectURL(anterior);
  }).catch(() => {});
  return meta;
}

/** Quita el margen blanco del recorte del PDF solo para mostrarlo. No altera el paquete. */
async function recortarMargen(blob) {
  if (typeof createImageBitmap !== 'function') return null;
  const bmp = await createImageBitmap(blob);
  const lienzo = document.createElement('canvas');
  lienzo.width = bmp.width;
  lienzo.height = bmp.height;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  const esTinta = (x, y) => {
    const i = (y * width + x) * 4;
    return data[i] < 246 || data[i + 1] < 246 || data[i + 2] < 246;
  };
  const filaVacia = (y) => {
    let tinta = 0;
    for (let x = 0; x < width; x += 1) if (esTinta(x, y)) tinta += 1;
    return tinta < Math.max(2, width * 0.004);
  };
  const columnaVacia = (x) => {
    let tinta = 0;
    for (let y = 0; y < height; y += 1) if (esTinta(x, y)) tinta += 1;
    return tinta < Math.max(2, height * 0.004);
  };
  let minX = 0;
  let minY = 0;
  let maxX = width - 1;
  let maxY = height - 1;
  while (minY < maxY && filaVacia(minY)) minY += 1;
  while (maxY > minY && filaVacia(maxY)) maxY -= 1;
  while (minX < maxX && columnaVacia(minX)) minX += 1;
  while (maxX > minX && columnaVacia(maxX)) maxX -= 1;
  if (maxX <= minX || maxY <= minY) return null;
  const margen = 6;
  minX = Math.max(0, minX - margen);
  minY = Math.max(0, minY - margen);
  maxX = Math.min(width - 1, maxX + margen);
  maxY = Math.min(height - 1, maxY + margen);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const pocaGanancia = w > width * 0.92 && h > height * 0.92;
  const demasiado = w * h < width * height * 0.15;
  if (pocaGanancia || demasiado) return null;
  const salida = document.createElement('canvas');
  salida.width = w;
  salida.height = h;
  salida.getContext('2d').drawImage(bmp, minX, minY, w, h, 0, 0, w, h);
  const recorte = await new Promise((resolver) => salida.toBlob(resolver, 'image/jpeg', 0.92));
  bmp.close?.();
  if (!recorte) return null;
  return { blob: recorte, ancho: w, alto: h };
}

function urlImagen(p, casilla) {
  const hash = p?.imagenes_sha256?.[casilla];
  return hash ? urlDeHash(hash) : null;
}

function galeriaDe(p) {
  const disponibles = new Set(p.imagenes_disponibles || Object.keys(p.imagenes_sha256 || {}));
  const out = [];
  for (const [casilla, alt] of CASILLAS) {
    if (!disponibles.has(casilla)) continue;
    const meta = urlImagen(p, casilla);
    if (!meta) continue;
    out.push({ casilla, alt, url: meta.url, ancho: meta.ancho, alto: meta.alto, hash: meta.hash });
  }
  return out;
}

function observarThumbs(root) {
  if (!io) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        pintarThumb(e.target);
        io.unobserve(e.target);
      }
    }, { rootMargin: '500px' });
  }
  root.querySelectorAll('.thumb[data-sap]').forEach((el) => io.observe(el));
}

function pintarThumb(el) {
  if (el.querySelector('img') || el.dataset.listo) return;
  el.dataset.listo = '1';
  const p = state.porSap.get(el.dataset.sap);
  if (!p) return;
  const meta = urlImagen(p, el.dataset.casilla || 'etiqueta') || urlImagen(p, 'etiqueta');
  if (!meta) {
    el.classList.add('sin-foto');
    el.textContent = (p.marca || 'PT').slice(0, 2).toUpperCase();
    return;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.dataset.hash = meta.hash;
  img.src = meta.url;
  el.appendChild(img);
}

function htmlDeVista() {
  const r = state.ruta;
  if (r.vista === 'inicio') return htmlInicio(datosInicio());
  if (r.vista === 'buscar') return htmlBuscar(ctxBuscar());
  if (r.vista === 'producto') {
    const p = state.porSap.get(r.sap);
    if (!p) {
      return `<section><h1>No está el SAP ${escapeHtml(r.sap)}</h1><p>No hay una ficha con ese código.</p><p><a href="?vista=buscar">Volver a la búsqueda</a></p></section>`;
    }
    const mezcla = state.porMezcla.get(p.sap_mezcla) || [];
    state.galeriaActual = galeriaDe(p);
    return htmlProducto({
      p,
      hermanos: mezcla,
      galeria: state.galeriaActual,
      vacios: state.vacios,
      enComparar: state.comparar.includes(p.codigo_sap),
      favorito: esFavorito(p.codigo_sap),
      modificada: Boolean(state.doc?.cambios?.modificados?.some((item) => item.sap === p.codigo_sap)),
    });
  }
  if (r.vista === 'comparar') {
    const lista = state.comparar.map((sap) => state.porSap.get(sap)).filter(Boolean);
    state.comparar = lista.map((p) => p.codigo_sap);
    return htmlComparar({ productos: lista, relacionados: relacionadosComparar(lista) });
  }
  if (r.vista === 'novedades') return htmlNovedades(state.doc?.cambios ?? null);
  if (r.vista === 'actualizar') return htmlActualizar(vistaAct());
  if (r.vista === 'ean') {
    const lista = fichasPorEan(productos(), r.codigo);
    return htmlResultadoEan({ codigo: r.codigo, productosLista: lista });
  }
  if (r.vista === 'codigos') return htmlCodigos({ ...listaCodigos(), q: state.qG });
  if (r.vista === 'material') {
    const m = state.mat ? materialExacto(state.mat, r.codigo, { minimo: 1 }) : null;
    return htmlMaterial({ codigo: r.codigo, m, tipos: m ? vistaMaterial(m) : [] });
  }
  if (r.vista === 'materiales') return htmlMateriales(ctxMateriales());
  if (r.vista === 'g') {
    const hallado = productosMezcla(r.codigo);
    return htmlCodigoG(hallado);
  }
  return htmlInicio(datosInicio());
}

/* ---------- Materiales auxiliares ---------- */

function conTextoTipos(m) {
  return { ...m, codigo: m.codigo, n: m.n, tiposTexto: resumenTipos(m).map((t) => t.tipo).join(' · ') };
}

/** Modelo de pantalla de un material: por tipo, marcas y fotos (y la galería del visor). */
function vistaMaterial(m) {
  const galeria = [];
  const tipos = [];
  for (const [tipo, porSap] of m.tipos) {
    const grupos = porMarca(porSap, state.etMarca);
    const def = FOTO_TIPO[tipo];
    let foto = null;
    let sinFoto = '';
    if (!def) {
      sinFoto = `Las fichas no traen dibujo de ${tipo.toLowerCase()}.`;
    } else {
      const { casilla, fotos } = fotosMaterial(tipo, porSap);
      const conUrl = [];
      for (const f of fotos) {
        const meta = urlDeHash(f.hash);
        if (meta) conUrl.push({ ...f, url: meta.url, ancho: meta.ancho, alto: meta.alto });
      }
      if (!conUrl.length) {
        sinFoto = `${porSap.size === 1 ? 'La ficha no trae' : `Ninguna de las ${porSap.size} fichas trae`} el dibujo «${def[1]}».`;
      } else {
        for (const f of conUrl) {
          f.i = galeria.length;
          galeria.push({ casilla, alt: `${def[1]} · ${tipo} ${m.codigo} · SAP ${f.productos[0].codigo_sap}`, url: f.url, ancho: f.ancho, alto: f.alto, hash: f.hash });
        }
        const conDibujo = fotos.reduce((n, f) => n + f.productos.length, 0);
        foto = { alt: def[1], fotos: conUrl, sinDibujo: porSap.size - conDibujo };
      }
    }
    tipos.push({ tipo, n: porSap.size, grupos, foto, sinFoto });
  }
  state.galeriaActual = galeria;
  return tipos;
}

function textoMarcas(porSap) {
  return porMarca(porSap, state.etMarca).slice(0, 3).map((g) => `${g.etiqueta} ${g.items.length}`).join(' · ')
    + (porMarca(porSap, state.etMarca).length > 3 ? ' · …' : '');
}

function entradasMateriales() {
  const q = compactar(state.qM);
  const base = materialesCompartidos(state.mat, state.matTodos ? 1 : 2);
  const totalSinFiltro = base.length;
  const porQ = q ? base.filter((x) => {
    if (!x.blob) {
      const ps = [...x.m.tipos.get(x.tipo).values()].map((e) => `${e.p.codigo_sap} ${e.p.producto} ${e.p.marca || ''}`).join(' ');
      x.blob = compactar(`${x.codigo} ${ps}`);
    }
    return x.blob.includes(q);
  }) : base;
  const cuenta = new Map();
  for (const x of porQ) cuenta.set(x.tipo, (cuenta.get(x.tipo) || 0) + 1);
  const tipos = [...cuenta.entries()].sort((a, b) => ordenTipo(a[0]) - ordenTipo(b[0]));
  const lista = state.tipoM ? porQ.filter((x) => x.tipo === state.tipoM) : porQ;
  return { lista, tipos, totalSinFiltro };
}

function ctxMateriales() {
  const { lista, tipos, totalSinFiltro } = entradasMateriales();
  const porTipo = new Map();
  for (const x of lista) {
    if (!porTipo.has(x.tipo)) porTipo.set(x.tipo, []);
    porTipo.get(x.tipo).push({ codigo: x.codigo, n: x.n, marcas: textoMarcas(x.m.tipos.get(x.tipo)) });
  }
  const grupos = [...porTipo.entries()].sort((a, b) => ordenTipo(a[0]) - ordenTipo(b[0])).map(([tipo, items]) => ({ tipo, items }));
  return { grupos, total: lista.length, totalSinFiltro, q: state.qM, tipo: state.tipoM, tipos, todos: state.matTodos };
}

/** La lista cuelga de <body> (la cabecera recorta lo que sobresale) y se coloca bajo la barra de búsqueda. */
function colocarSug() {
  const ul = document.getElementById('q-sug');
  const input = document.getElementById('q');
  if (!ul || ul.hidden || !input) return;
  const r = input.getBoundingClientRect();
  ul.style.top = `${Math.round(r.bottom + 6)}px`;
  ul.style.left = `${Math.round(r.left)}px`;
  ul.style.width = `${Math.round(r.width)}px`;
  ul.style.maxHeight = `${Math.max(160, Math.min(440, window.innerHeight - r.bottom - 16))}px`;
}

function pintarSug() {
  const input = document.getElementById('q');
  let ul = document.getElementById('q-sug');
  if (!ul) {
    ul = document.createElement('ul');
    ul.id = 'q-sug';
    ul.className = 'sugerencias';
    ul.setAttribute('role', 'listbox');
    ul.setAttribute('aria-label', 'Materiales auxiliares');
    ul.hidden = true;
    document.body.appendChild(ul);
    window.addEventListener('resize', colocarSug);
    window.addEventListener('scroll', colocarSug, { passive: true });
  }
  if (!input) return;
  const { items, total, activa, q } = state.sug;
  const abierto = items.length > 0;
  ul.innerHTML = abierto ? htmlSugerencias({ items, total, q, activa }) : '';
  ul.hidden = !abierto;
  colocarSug();
  input.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  if (abierto && activa >= 0) {
    input.setAttribute('aria-activedescendant', `sug-${activa}`);
    document.getElementById(`sug-${activa}`)?.scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}

function actualizarSug(valor) {
  if (!state.mat) return;
  const s = sugerirMateriales(state.mat, valor, 8);
  state.sug = { items: s.items.map(conTextoTipos), total: s.total, activa: -1, q: String(valor || '').trim() };
  pintarSug();
}

function cerrarSug() {
  if (!state.sug.items.length) return;
  state.sug = { items: [], total: 0, activa: -1, q: '' };
  pintarSug();
}

function nOpcionesSug() {
  return state.sug.items.length + (state.sug.total > state.sug.items.length ? 1 : 0);
}

function abrirMaterial(codigo) {
  cerrarSug();
  const input = document.getElementById('q');
  state.q = codigo;
  if (input) {
    input.value = codigo;
    input.blur();
  }
  ir('material', { codigo });
}

function verTodosMateriales(q) {
  cerrarSug();
  state.qM = q;
  state.tipoM = '';
  state.matTodos = true;
  ir('materiales');
}

function enlaceMaterial(codigo) {
  const url = new URL(location.href);
  url.search = `?mat=${encodeURIComponent(codigo)}`;
  url.hash = '';
  return url.toString();
}

let excelCarga = null;
function precargarExcel() {
  const f = () => cargarExcelJS().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(f, { timeout: 3000 });
  else setTimeout(f, 800);
}
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelCarga) {
    excelCarga = new Promise((resolver, rechazar) => {
      const sc = document.createElement('script');
      sc.src = 'js/vendor/exceljs.min.js';
      sc.onload = () => (window.ExcelJS ? resolver(window.ExcelJS) : rechazar(new Error('ExcelJS')));
      sc.onerror = () => { excelCarga = null; rechazar(new Error('No se ha podido cargar el generador de Excel')); };
      document.head.appendChild(sc);
    });
  }
  return excelCarga;
}

function ahoraMadrid() {
  return new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' });
}

function esMovil() {
  return Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function avisoApp(titulo, texto, enlace) {
  document.getElementById('compartir')?.remove();
  const capa = document.createElement('div');
  capa.id = 'compartir';
  capa.innerHTML = `<div class="share" role="dialog" aria-modal="true" aria-labelledby="aviso-tit">
    <h2 id="aviso-tit">${escapeHtml(titulo)}</h2>
    <p>${escapeHtml(texto)}</p>
    <div class="acciones">
      ${enlace ? `<button type="button" class="btn btn-primary" data-act="copiar" data-copy="${escapeHtml(enlace)}">Copiar enlace</button>` : ''}
      <button type="button" class="btn btn-ghost" data-act="cerrar-compartir">Cerrar</button>
    </div>
  </div>`;
  document.body.appendChild(capa);
}

/** Respuesta del puente nativo de la app Android v1.1.0+ al guardar un archivo. */
window.__fichasArchivo = (r) => {
  if (r?.ok) toast(`Guardado en ${r.ubicacion}/${r.nombre}`);
  else toast('No se ha podido guardar el archivo en el teléfono.');
};

async function blobABase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** PC: descarga. Móvil: menú compartir del sistema si admite archivos; si no, descarga. App Android: puente nativo si existe. */
async function entregarArchivo(blob, nombre, titulo, enlace) {
  const android = window.FichasAndroid;
  if (android) {
    if (typeof android.guardarArchivo === 'function') {
      // App Android v1.1.0+: guarda en Descargas/Fichas Alcolea y abre el menú de compartir del sistema.
      android.guardarArchivo(nombre, XLSX_MIME, await blobABase64(blob));
      return 'app';
    }
    avisoApp('Excel desde la app Android', 'Esta versión de la app Android (v1.0.0) no puede guardar archivos. Instala la v1.1.0 encima (github.com/jorgefausto0074-pc/fichas-producto-alcolea/releases/latest) o abre este resultado en Chrome del móvil o en el PC con el enlace y exporta desde allí.', enlace);
    return 'sin-soporte';
  }
  const archivo = typeof File === 'function' ? new File([blob], nombre, { type: XLSX_MIME }) : null;
  if (archivo && esMovil() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo });
      return 'compartido';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`Descargado ${nombre}`);
  return 'descargado';
}

async function exportar(hojas, nombre, titulo, enlace, boton) {
  if (boton) {
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
  }
  try {
    const ExcelJS = await cargarExcelJS();
    const buf = await libroXlsx(ExcelJS, { hojas });
    const blob = new Blob([buf], { type: XLSX_MIME });
    state.ultimoExcel = { nombre, bytes: blob.size };
    return await entregarArchivo(blob, nombre, titulo, enlace);
  } catch (err) {
    toast('No se ha podido generar el Excel.');
    console.error(err);
    return 'error';
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.removeAttribute('aria-busy');
    }
  }
}

function subtitulo(extra) {
  return `Fichas de producto terminado · Refresco Iberia, planta Alcolea. Datos del ${fechaPaquete(state.formato)}. Exportado el ${ahoraMadrid()} (hora de Madrid). ${extra}`;
}

function exportarMaterial(codigo, boton) {
  const m = state.mat && materialExacto(state.mat, codigo, { minimo: 1 });
  if (!m) return null;
  const filas = filasMaterial(m, state.etMarca);
  const tipos = resumenTipos(m).map((t) => t.tipo).join(', ');
  return exportar([{
    nombre: 'Productos',
    titulo: `Material auxiliar ${m.codigo} · ${tipos} · ${m.n} ${m.n === 1 ? 'producto' : 'productos'}`,
    subtitulo: subtitulo('Una fila por producto y tipo de material. Marca unificada como en los filtros de la app; códigos tal cual en la ficha.'),
    columnas: COLUMNAS_EXCEL,
    filas,
  }], nombreSeguro('MATERIAL', m.codigo), `Material ${m.codigo}`, enlaceMaterial(m.codigo), boton);
}

function exportarCompartidos(boton) {
  const { lista } = entradasMateriales();
  const resumen = lista.map((x) => {
    const porSap = x.m.tipos.get(x.tipo);
    const campos = [...new Set([...porSap.values()].flatMap((e) => e.campos))].join(', ');
    const marcas = porMarca(porSap, state.etMarca).map((g) => `${g.etiqueta} (${g.items.length})`).join(', ');
    return [x.tipo, campos, x.codigo, String(x.n), marcas];
  });
  const filas = lista.flatMap((x) => filasMaterial(x.m, state.etMarca, x.tipo));
  const filtro = [state.tipoM && `tipo ${state.tipoM}`, state.qM && `filtro «${state.qM}»`].filter(Boolean).join(', ');
  const que = state.matTodos ? 'Todos los materiales auxiliares' : 'Materiales compartidos (2 o más productos)';
  const base = state.matTodos ? 'MATERIALES' : 'MATERIALES_COMPARTIDOS';
  return exportar([
    {
      nombre: 'Resumen',
      titulo: `${que} · ${lista.length} códigos${filtro ? ` · ${filtro}` : ''}`,
      subtitulo: subtitulo('Una fila por código y tipo de material, ordenadas por número de productos.'),
      columnas: [['Tipo de material', 18], ['Campos de la ficha', 26], ['Código', 18], ['Nº de productos', 14], ['Marcas', 70]],
      filas: resumen,
    },
    {
      nombre: 'Productos',
      titulo: `${que} · detalle por producto`,
      subtitulo: subtitulo('Una fila por código, tipo de material y producto. Marca unificada como en los filtros de la app.'),
      columnas: COLUMNAS_EXCEL,
      filas,
    },
  ], nombreSeguro(base, state.tipoM), que, location.href, boton);
}

function relacionadosComparar(lista) {
  const ya = new Set(lista.map((p) => p.codigo_sap));
  const vistos = new Set();
  const out = [];
  for (const p of lista) {
    for (const hermano of state.porMezcla.get(p.sap_mezcla) || []) {
      if (ya.has(hermano.codigo_sap) || vistos.has(hermano.codigo_sap)) continue;
      vistos.add(hermano.codigo_sap);
      out.push(hermano);
    }
  }
  return out.slice(0, 6);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function datosInicio() {
  const lista = productos();
  const asepticos = lista.filter((p) => p.grupo_pdf === 'Asépticos').length;
  const carbonatados = lista.filter((p) => p.grupo_pdf === 'No asépticos').length;
  let compartidosG = 0;
  let compartidosMezcla = 0;
  let codigosG = 0;
  let mezclas = 0;
  const noG = [];
  for (const [codigo, arr] of state.porMezcla) {
    if (!codigo) continue;
    mezclas += 1;
    if (arr.length > 1) compartidosMezcla += 1;
    if (!esCodigoG(codigo)) {
      noG.push({ codigo, n: arr.length });
      continue;
    }
    codigosG += 1;
    if (arr.length > 1) compartidosG += 1;
  }
  noG.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const porFecha = lista.slice().sort((a, b) => (
    ordenFecha(b.fecha) - ordenFecha(a.fecha) || b.codigo_sap.localeCompare(a.codigo_sap)
  )).slice(0, 8);
  return {
    fechaHumana: fechaPaquete(state.formato),
    bruto: state.formato?.datos_generados || '',
    stats: {
      n: lista.length,
      asepticos,
      carbonatados,
      codigosG,
      compartidosG,
      compartidosMezcla,
      mezclas,
      noG,
      imagenes: Object.keys(state.imagenes || {}).length,
      incidencias: lista.reduce((n, p) => n + (p.incidencias?.length || 0), 0),
      fichasInc: lista.filter((p) => p.incidencias?.length).length,
    },
    formatos: contarValores(lista, 'formato'),
    familias: contarValores(lista, 'familia_derivada'),
    marcas: agruparMarcas(lista),
    recientes: porFecha,
    fuentes: state.formato?.fuentes || [],
    favoritos: favoritos().map((sap) => state.porSap.get(sap)).filter(Boolean),
    abiertas: recientes().map((sap) => state.porSap.get(sap)).filter(Boolean),
  };
}

function listaCodigos() {
  const q = compactar(state.qG);
  const codigos = [];
  const otros = [];
  for (const [codigo, arr] of state.porMezcla) {
    if (!codigo) continue;
    if (q) {
      const blob = compactar(`${codigo} ${arr.map((p) => `${p.codigo_sap} ${p.producto}`).join(' ')}`);
      if (!blob.includes(q)) continue;
    }
    const item = { codigo, n: arr.length, muestra: arr[0]?.producto || '' };
    if (esCodigoG(codigo)) codigos.push(item);
    else otros.push(item);
  }
  const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
  codigos.sort(porCodigo);
  otros.sort(porCodigo);
  return { codigos, otros };
}

function asegurarShell() {
  if (document.querySelector('.shell')) return;
  document.getElementById('app').innerHTML = htmlShell({ fecha: fechaPaquete(state.formato) });
  const input = document.getElementById('q');
  if (input) input.value = state.q;
  const inst = document.getElementById('btn-instalar');
  if (inst) inst.hidden = !state.installEvent;
  const act = document.getElementById('btn-actualizar');
  if (act) act.hidden = !state.hayActualizacion;
  pintarRed();
}

function titulo() {
  const r = state.ruta;
  let t = 'Fichas';
  if (r.vista === 'inicio') t = 'Inicio';
  else if (r.vista === 'buscar') t = state.q ? `Buscar ${state.q}` : 'Búsqueda';
  else if (r.vista === 'producto') t = `SAP ${r.sap}`;
  else if (r.vista === 'comparar') t = 'Comparar';
  else if (r.vista === 'novedades') t = 'Novedades';
  else if (r.vista === 'actualizar') t = 'Actualizar fichas';
  else if (r.vista === 'ean') t = 'Código de barras';
  else if (r.vista === 'codigos') t = 'Códigos G';
  else if (r.vista === 'g') t = r.codigo;
  else if (r.vista === 'material') t = `Material ${r.codigo}`;
  else if (r.vista === 'materiales') t = 'Materiales compartidos';
  document.title = `${t} · Fichas Alcolea`;
}

function marcarTabs() {
  const mapa = { g: 'codigos', producto: 'buscar', ean: 'buscar', material: 'materiales' };
  const actual = mapa[state.ruta.vista] || state.ruta.vista;
  document.querySelectorAll('.tabbar a[data-go]').forEach((a) => {
    if (a.dataset.go === actual) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function actualizarDock() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  const lista = state.comparar.map((sap) => state.porSap.get(sap)).filter(Boolean);
  const oculto = !lista.length || state.ruta.vista === 'comparar';
  dock.hidden = oculto;
  dock.innerHTML = oculto ? '' : htmlDock(lista);
}

function renderVista({ foco = true } = {}) {
  if (!state.listo) return;
  asegurarShell();
  cerrarLb();
  const el = document.getElementById('contenido');
  const firma = `${state.ruta.vista}:${state.ruta.sap || ''}:${state.ruta.codigo || ''}`;
  if (state.ruta.vista === 'producto' && state.ruta.sap && state.ultimaAnotada !== state.ruta.sap) {
    anotarReciente(state.ruta.sap);
    state.ultimaAnotada = state.ruta.sap;
  } else if (state.ruta.vista !== 'producto') {
    state.ultimaAnotada = '';
  }
  el.innerHTML = htmlDeVista();
  observarThumbs(el);
  if (state.ruta.vista === 'material' || state.ruta.vista === 'materiales') precargarExcel();
  const planta = document.getElementById('btn-planta');
  if (planta) planta.setAttribute('aria-pressed', document.documentElement.classList.contains('planta') ? 'true' : 'false');
  marcarTabs();
  titulo();
  actualizarDock();
  const input = document.getElementById('q');
  if (input && document.activeElement !== input && input.value !== state.q) input.value = state.q;
  if (foco && firma !== vistaFirma && document.activeElement?.id !== 'q' && document.activeElement?.id !== 'qg') {
    const h = el.querySelector('h1');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus();
    }
  }
  vistaFirma = firma;
}

function pintarResultados() {
  const el = document.getElementById('resultados');
  if (!el) {
    renderVista({ foco: false });
    return;
  }
  const ctx = ctxBuscar();
  el.innerHTML = htmlResultados(ctx);
  observarThumbs(el);
  if (ctx.hayMaterial) precargarExcel();
  titulo();
}

function pintarLogin() {
  document.getElementById('app').innerHTML = htmlLogin({
    error: state.errorLogin,
    ocupado: state.ocupado,
    fecha: state.formato ? fechaPaquete(state.formato) : '',
    destino: state.ruta?.vista === 'producto' ? state.ruta.sap : '',
  });
  document.title = 'Fichas de producto · Alcolea';
}

async function pintarRed() {
  const el = document.getElementById('aviso-red');
  if (!el) return;
  if (navigator.onLine) {
    el.hidden = true;
    return;
  }
  try {
    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('formato.json', { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(temporizador);
    el.hidden = res.ok;
  } catch {
    el.hidden = false;
  }
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

async function copiar(texto) {
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiado');
}

function aplicarPaquete(paquete) {
  state.doc = paquete.doc;
  if (state.doc && paquete.cambios && state.doc.cambios == null) state.doc.cambios = paquete.cambios;
  state.imagenes = paquete.imagenes;
  state.blob = paquete.blob;
  const idx = indexar(paquete.doc);
  state.porSap = idx.porSap;
  state.porMezcla = idx.porMezcla;
  state.mat = indexarMateriales(paquete.doc?.productos || []);
  state.etMarca = etiquetasMarca(paquete.doc?.productos || []);
  state.listo = true;
  state.ocupado = false;
  state.errorLogin = '';
  restaurarCmp();
  vistaFirma = '';
  document.getElementById('app').innerHTML = '';
  renderVista();
}

async function entrar(fd) {
  const password = String(fd.get('clave') || '');
  const recordar = fd.get('recordar') != null;
  state.errorLogin = '';
  const errorEl = document.querySelector('.login .error');
  if (errorEl) errorEl.textContent = '';
  marcarOcupado(true);
  try {
    if (!state.formato) state.formato = await obtenerFormato();
    const key = await derivarClave(password, state.formato);
    const buf = await obtenerCifrado(state.formato.sha256_datos_enc);
    const paquete = await descifrarConClave(key, state.formato, buf);
    if (recordar) await guardarClave(key, { sal_hex: state.formato.sal_hex });
    else await borrarClave().catch(() => {});
    claveAplicacion = password;
    aplicarPaquete(paquete);
    if (state.ruta.vista === 'actualizar') prepararPantallaAct();
  } catch (err) {
    marcarOcupado(false);
    const msg = err?.name === 'OperationError'
      ? 'Contraseña incorrecta.'
      : 'No se ha podido abrir el paquete. Recarga la página e inténtalo de nuevo.';
    const el = document.querySelector('.login .error');
    if (el) {
      el.textContent = msg;
      const campo = document.getElementById('clave');
      campo?.focus();
      campo?.select();
    } else {
      state.errorLogin = msg;
      pintarLogin();
    }
  }
}

function marcarOcupado(on) {
  state.ocupado = on;
  const btn = document.querySelector('#login-form button[type="submit"]');
  const input = document.getElementById('clave');
  const box = document.querySelector('#login-form input[name="recordar"]');
  if (btn) {
    btn.disabled = on;
    btn.textContent = on ? 'Abriendo las fichas…' : 'Entrar';
    if (on) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  }
  if (input) input.disabled = on;
  if (box) box.disabled = on;
}

async function salir() {
  await borrarClave().catch(() => {});
  await borrarAccesoEnvuelto().catch(() => {});
  claveAplicacion = '';
  acceso = null;
  actGeneracion += 1;
  pantallaActLista = false;
  act.fase = 'clave';
  act.informe = null;
  act.error = '';
  limpiarAct();
  for (const meta of urls.values()) URL.revokeObjectURL(meta.url);
  urls.clear();
  state.doc = null;
  state.imagenes = null;
  state.blob = null;
  state.porSap = new Map();
  state.porMezcla = new Map();
  state.listo = false;
  state.comparar = [];
  state.galeriaActual = [];
  guardarCmp();
  cerrarLb();
  state.errorLogin = '';
  state.ocupado = false;
  vistaFirma = '';
  pintarLogin();
}

function vistaAct() {
  return {
    fase: act.fase,
    error: act.error,
    texto: act.texto,
    runUrl: act.runUrl,
    ocupado: act.ocupado,
    informe: act.informe,
    pideClaveApp: !claveAplicacion,
  };
}

function guardarAct() {
  try {
    sessionStorage.setItem(CLAVE_ACT, JSON.stringify({
      fase: act.fase, solicitud: act.solicitud, desde: act.desde,
    }));
  } catch { /* modo privado */ }
}

function leerAct() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_ACT) || 'null'); } catch { return null; }
}

function limpiarAct() {
  try { sessionStorage.removeItem(CLAVE_ACT); } catch { /* modo privado */ }
}

function pintarAct() {
  if (state.ruta.vista !== 'actualizar') return;
  renderVista({ foco: false });
}

function clienteAct() {
  return crearCliente({ token: acceso.token, repo: acceso.repo });
}

async function comprobarClaveApp(password) {
  const key = await derivarClave(password, state.formato);
  const buf = await obtenerCifrado(state.formato.sha256_datos_enc);
  await descifrarConClave(key, state.formato, buf);
  claveAplicacion = password;
}

async function prepararPantallaAct() {
  if (pantallaActLista) return;
  pantallaActLista = true;
  try {
    if (!acceso) {
      const guardado = await desenvolverToken();
      if (guardado) acceso = guardado;
    }
  } catch { /* sin sesión de actualización */ }
  if (acceso && act.fase === 'clave') act.fase = 'pdfs';
  const ses = leerAct();
  if (acceso && ses?.solicitud && (ses.fase === 'revisando' || ses.fase === 'publicando' || ses.fase === 'subida')) {
    act.solicitud = ses.solicitud;
    act.desde = ses.desde || new Date(0).toISOString();
    act.fase = ses.fase === 'subida' ? 'revisando' : ses.fase;
    act.texto = act.fase === 'publicando' ? 'Publicando las fichas…' : 'Revisando las fichas.';
    const gen = ++actGeneracion;
    pintarAct();
    vigilar(gen);
    return;
  }
  pintarAct();
}

async function vigilar(gen) {
  const modo = act.fase;
  try {
    const gh = clienteAct();
    const run = await seguir(gh, { solicitud: act.solicitud, desde: act.desde, intervalo: 8000, limite: 100 });
    if (gen !== actGeneracion) return;
    if (run.status !== 'completed') {
      act.texto = 'Sigue en curso. Puedes dejar esta pantalla abierta.';
      guardarAct();
      pintarAct();
      return;
    }
    if (run.conclusion === 'success') {
      if (modo === 'publicando') {
        act.fase = 'publicado';
        act.error = '';
        act.runUrl = '';
        limpiarAct();
        pintarAct();
        return;
      }
      if (!claveAplicacion) {
        act.fase = 'clave-app';
        act.error = '';
        pintarAct();
        return;
      }
      act.informe = await informeDeRelease(gh, claveAplicacion);
      act.fase = 'informe';
      act.error = '';
      guardarAct();
      pintarAct();
      return;
    }
    const resultado = await leerResultado(gh).catch(() => null);
    const msg = mensajeFallo({ resultado, run });
    act.fase = 'error';
    act.error = msg.texto;
    act.runUrl = msg.url;
    guardarAct();
    pintarAct();
  } catch (err) {
    if (gen !== actGeneracion) return;
    act.fase = 'error';
    act.error = sanear(err?.message || 'No se ha podido seguir la ejecución.', acceso?.token);
    act.runUrl = err?.runUrl || '';
    guardarAct();
    pintarAct();
  }
}

async function onAcceso(fd) {
  act.ocupado = true;
  act.error = '';
  pintarAct();
  try {
    const abierto = await descargarAcceso(String(fd.get('clave') || ''));
    acceso = { token: abierto.token, repo: abierto.repo };
    if (fd.get('recordar') != null) await envolverToken(abierto.token, abierto.repo);
    else await borrarAccesoEnvuelto();
    act.fase = 'pdfs';
    act.ocupado = false;
    guardarAct();
  } catch (err) {
    act.ocupado = false;
    act.error = err?.code === 'clave' || err?.code === 'sin-acceso' || err?.code === 'acceso-formato'
      ? err.message
      : sanear(err?.message || 'No se ha podido abrir el acceso.', acceso?.token);
  }
  pintarAct();
}

async function onPdfs(form) {
  const gen = ++actGeneracion;
  act.ocupado = true;
  act.error = '';
  pintarAct();
  try {
    if (!claveAplicacion) {
      try {
        await comprobarClaveApp(String(new FormData(form).get('clave-app') || ''));
      } catch (err) {
        act.ocupado = false;
        act.error = err?.name === 'OperationError'
          ? 'Contraseña de la aplicación incorrecta.'
          : 'No se ha podido comprobar la contraseña de la aplicación.';
        pintarAct();
        return;
      }
    }
    const archivos = await leerPdfs(form.querySelector('#pdfs').files);
    act.solicitud = nuevaSolicitud();
    act.desde = new Date().toISOString();
    act.fase = 'subida';
    act.texto = 'Cifrando y subiendo los PDF…';
    act.ocupado = false;
    guardarAct();
    pintarAct();
    const gh = clienteAct();
    await subirRevision(gh, { password: claveAplicacion, archivos, solicitud: act.solicitud });
    if (gen !== actGeneracion) return;
    act.fase = 'revisando';
    act.texto = 'Revisando las fichas.';
    guardarAct();
    pintarAct();
    await vigilar(gen);
  } catch (err) {
    if (gen !== actGeneracion) return;
    act.ocupado = false;
    act.fase = 'error';
    act.error = sanear(err?.message || 'No se han podido enviar los PDF.', acceso?.token);
    act.runUrl = err?.runUrl || '';
    guardarAct();
    pintarAct();
  }
}

async function onClaveInforme(fd) {
  act.ocupado = true;
  act.error = '';
  pintarAct();
  try {
    await comprobarClaveApp(String(fd.get('clave-app') || ''));
    act.informe = await informeDeRelease(clienteAct(), claveAplicacion);
    act.fase = 'informe';
    act.ocupado = false;
    act.error = '';
    guardarAct();
  } catch (err) {
    act.ocupado = false;
    act.error = err?.name === 'OperationError'
      ? 'Contraseña de la aplicación incorrecta.'
      : sanear(err?.message || 'No se ha podido abrir el informe.', acceso?.token);
  }
  pintarAct();
}

async function onAprobar() {
  const gen = ++actGeneracion;
  act.fase = 'publicando';
  act.texto = 'Publicando las fichas…';
  act.error = '';
  act.solicitud = nuevaSolicitud();
  act.desde = new Date().toISOString();
  guardarAct();
  pintarAct();
  try {
    await aprobar(clienteAct(), act.solicitud);
    await vigilar(gen);
  } catch (err) {
    if (gen !== actGeneracion) return;
    act.fase = 'error';
    act.error = sanear(err?.message || 'No se ha podido publicar.', acceso?.token);
    act.runUrl = err?.runUrl || '';
    guardarAct();
    pintarAct();
  }
}

async function onDescartar() {
  act.ocupado = true;
  act.error = '';
  pintarAct();
  try {
    if (acceso) await descartar(clienteAct());
    act.fase = acceso ? 'pdfs' : 'clave';
    act.informe = null;
    act.runUrl = '';
    limpiarAct();
  } catch (err) {
    act.fase = 'error';
    act.error = sanear(err?.message || 'No se ha podido descartar.', acceso?.token);
  }
  act.ocupado = false;
  pintarAct();
}

function ir(vista, extra = {}, { replace = false } = {}) {
  cerrarSug();
  if (vista === 'inicio') {
    state.q = '';
    state.filtros = filtroVacio();
    const input = document.getElementById('q');
    if (input) input.value = '';
  }
  state.ruta = { vista, ...extra };
  history[replace ? 'replaceState' : 'pushState'](null, '', construirUrl());
  renderVista();
  if (vista === 'actualizar') prepararPantallaAct();
}

function aplicarFiltro(k, v) {
  const desdeInicio = state.ruta.vista === 'inicio';
  if (k === 'inc') state.filtros.inc = desdeInicio ? true : !state.filtros.inc;
  else if (desdeInicio) {
    state.filtros = filtroVacio();
    state.filtros[k] = v;
  } else state.filtros[k] = state.filtros[k] === v ? '' : v;
  state.limite = 48;
  const ya = state.ruta.vista === 'buscar';
  state.ruta = { vista: 'buscar' };
  history[ya ? 'replaceState' : 'pushState'](null, '', construirUrl());
  renderVista({ foco: !ya });
  const pulsado = [...document.querySelectorAll(`[data-act="filtro"][data-k="${k}"]`)].find((b) => (b.dataset.v ?? '') === v);
  pulsado?.focus();
}

function toggleComparar(sap) {
  const i = state.comparar.indexOf(sap);
  if (i >= 0) state.comparar.splice(i, 1);
  else if (state.comparar.length >= 3) {
    toast('Puedes comparar hasta 3 fichas. Quita una para añadir otra.');
    return;
  } else state.comparar.push(sap);
  guardarCmp();
  if (state.ruta.vista === 'comparar') {
    history.replaceState(null, '', construirUrl());
  }
  renderVista({ foco: false });
  toast(i >= 0 ? 'Quitada de la comparación' : 'Añadida a la comparación');
}

function onQuery(value) {
  state.q = value;
  state.limite = 48;
  const ya = state.ruta.vista === 'buscar';
  state.ruta = { vista: 'buscar' };
  history[ya ? 'replaceState' : 'pushState'](null, '', construirUrl());
  if (ya) pintarResultados();
  else renderVista({ foco: false });
}

function abrirLb(indice) {
  if (!state.galeriaActual.length) return;
  const items = state.galeriaActual.map((item) => {
    const viva = item.hash && urls.get(item.hash);
    return viva ? { ...item, url: viva.url, ancho: viva.ancho, alto: viva.alto } : item;
  });
  state.lb = { items, index: indice, scale: 1, x: 0, y: 0 };
  pintarLb(true);
  document.body.classList.add('lb-open');
}

function cerrarLb() {
  if (!state.lb && !document.getElementById('lightbox')) return;
  state.lb = null;
  document.getElementById('lightbox')?.remove();
  document.body.classList.remove('lb-open');
}

function pintarLb(enganchar) {
  let host = document.getElementById('lightbox');
  if (!host) {
    host = document.createElement('div');
    host.id = 'lightbox';
    document.body.appendChild(host);
  }
  host.innerHTML = htmlLightbox(state.lb);
  aplicarTransform();
  if (enganchar) engancharLb();
  host.querySelector('[data-act="lb-close"]')?.focus();
}

function aplicarTransform() {
  const img = document.getElementById('lb-img');
  if (!img || !state.lb) return;
  img.style.transform = `translate(${state.lb.x}px, ${state.lb.y}px) scale(${state.lb.scale})`;
}

function zoomLb(delta) {
  if (!state.lb) return;
  if (delta === 'reset') {
    state.lb.scale = 1;
    state.lb.x = 0;
    state.lb.y = 0;
  } else {
    state.lb.scale = Math.min(5, Math.max(1, state.lb.scale + Number(delta)));
    if (state.lb.scale === 1) {
      state.lb.x = 0;
      state.lb.y = 0;
    }
  }
  aplicarTransform();
}

function moverLb(dir) {
  if (!state.lb) return;
  const n = state.lb.items.length;
  state.lb.index = (state.lb.index + dir + n) % n;
  state.lb.scale = 1;
  state.lb.x = 0;
  state.lb.y = 0;
  const item = state.lb.items[state.lb.index];
  const img = document.getElementById('lb-img');
  const cap = document.getElementById('lb-cap');
  if (img) {
    img.src = item.url;
    img.alt = item.alt;
  }
  if (cap) cap.textContent = `${item.alt} ${state.lb.index + 1} / ${n}`;
  aplicarTransform();
}

function engancharLb() {
  const stage = document.getElementById('lb-stage');
  if (!stage) return;
  const pointers = new Map();
  let pinch = null;
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: state.lb.scale };
      drag = null;
    } else {
      drag = { x: e.clientX, y: e.clientY, ox: state.lb.x, oy: state.lb.y, sx: e.clientX };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !state.lb) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      state.lb.scale = Math.min(5, Math.max(1, pinch.scale * (dist / pinch.dist)));
      aplicarTransform();
      return;
    }
    if (drag && state.lb.scale > 1) {
      state.lb.x = drag.ox + (e.clientX - drag.x);
      state.lb.y = drag.oy + (e.clientY - drag.y);
      aplicarTransform();
    }
  });
  const soltar = (e) => {
    if (drag && state.lb && state.lb.scale === 1 && pointers.size === 1) {
      const dx = e.clientX - drag.sx;
      if (dx > 70) moverLb(-1);
      else if (dx < -70) moverLb(1);
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) drag = null;
  };
  stage.addEventListener('pointerup', soltar);
  stage.addEventListener('pointercancel', soltar);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomLb(e.deltaY < 0 ? 0.2 : -0.2);
  }, { passive: false });
  stage.addEventListener('dblclick', () => {
    if (!state.lb) return;
    if (state.lb.scale > 1) zoomLb('reset');
    else {
      state.lb.scale = 2;
      aplicarTransform();
    }
  });
}

function onClick(ev) {
  if (!ev.target.closest('#form-buscar, #q-sug')) cerrarSug();
  const act = ev.target.closest('[data-act]');
  if (act) {
    const tipo = act.dataset.act;
    if (tipo === 'sug') {
      ev.preventDefault();
      abrirMaterial(act.dataset.codigo);
      return;
    }
    if (tipo === 'sug-todos') {
      ev.preventDefault();
      verTodosMateriales(act.dataset.q || '');
      return;
    }
    if (tipo === 'excel-mat') {
      ev.preventDefault();
      exportarMaterial(act.dataset.codigo, act);
      return;
    }
    if (tipo === 'excel-compartidos') {
      ev.preventDefault();
      exportarCompartidos(act);
      return;
    }
    if (tipo === 'copiar-mat') {
      ev.preventDefault();
      copiar(`Material auxiliar ${act.dataset.codigo} en las fichas de producto terminado. Hace falta la contraseña de la aplicación para verlo.\n${enlaceMaterial(act.dataset.codigo)}`);
      return;
    }
    if (tipo === 'tipo-mat') {
      ev.preventDefault();
      const v = act.dataset.v || '';
      state.tipoM = state.tipoM === v ? '' : v;
      history.replaceState(null, '', construirUrl());
      renderVista({ foco: false });
      document.querySelector(`[data-act="tipo-mat"][data-v="${CSS.escape(state.tipoM)}"]`)?.focus();
      return;
    }
    if (tipo === 'mat-todos') {
      ev.preventDefault();
      state.matTodos = !state.matTodos;
      state.tipoM = '';
      history.replaceState(null, '', construirUrl());
      renderVista({ foco: false });
      document.querySelector('[data-act="mat-todos"]')?.focus();
      return;
    }
    if (tipo === 'salir') {
      ev.preventDefault();
      salir();
      return;
    }
    if (tipo === 'olvidar-act') {
      ev.preventDefault();
      acceso = null;
      act.fase = 'clave';
      act.error = '';
      act.informe = null;
      borrarAccesoEnvuelto().then(() => pintarAct());
      return;
    }
    if (tipo === 'aprobar-act') {
      ev.preventDefault();
      onAprobar();
      return;
    }
    if (tipo === 'descartar-act') {
      ev.preventDefault();
      onDescartar();
      return;
    }
    if (tipo === 'reintentar-act') {
      ev.preventDefault();
      act.fase = acceso ? 'pdfs' : 'clave';
      act.error = '';
      act.runUrl = '';
      act.informe = null;
      pintarAct();
      return;
    }
    if (tipo === 'recargar-act') {
      ev.preventDefault();
      location.reload();
      return;
    }
    if (tipo === 'instalar') {
      ev.preventDefault();
      state.installEvent?.prompt();
      state.installEvent = null;
      act.hidden = true;
      return;
    }
    if (tipo === 'actualizar') {
      ev.preventDefault();
      state.swReg?.waiting?.postMessage({ tipo: 'skip-waiting' });
      navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload(), { once: true });
      return;
    }
    if (tipo === 'limpiar-q') {
      ev.preventDefault();
      cerrarSug();
      onQuery('');
      const input = document.getElementById('q');
      if (input) {
        input.value = '';
        input.focus();
      }
      return;
    }
    if (tipo === 'filtro') {
      ev.preventDefault();
      aplicarFiltro(act.dataset.k, act.dataset.v ?? '');
      return;
    }
    if (tipo === 'mas') {
      ev.preventDefault();
      state.limite += 48;
      pintarResultados();
      return;
    }
    if (tipo === 'copiar') {
      ev.preventDefault();
      copiar(act.dataset.copy || '');
      return;
    }
    if (tipo === 'copiar-enlace') {
      ev.preventDefault();
      copiar(location.href);
      return;
    }
    if (tipo === 'imprimir') {
      ev.preventDefault();
      window.print();
      return;
    }
    if (tipo === 'escanear') {
      ev.preventDefault();
      abrirEscaner();
      return;
    }
    if (tipo === 'cerrar-escaner') {
      ev.preventDefault();
      cerrarEscaner();
      return;
    }
    if (tipo === 'fav') {
      ev.preventDefault();
      toggleFavorito(act.dataset.sap);
      renderVista({ foco: false });
      return;
    }
    if (tipo === 'limpiar-fav') {
      ev.preventDefault();
      limpiarFavoritos();
      renderVista({ foco: false });
      return;
    }
    if (tipo === 'limpiar-recientes') {
      ev.preventDefault();
      limpiarRecientes();
      renderVista({ foco: false });
      return;
    }
    if (tipo === 'planta') {
      ev.preventDefault();
      fijarPlanta(!document.documentElement.classList.contains('planta'));
      act.setAttribute('aria-pressed', document.documentElement.classList.contains('planta') ? 'true' : 'false');
      return;
    }
    if (tipo === 'compartir') {
      ev.preventDefault();
      abrirCompartir(act.dataset.sap);
      return;
    }
    if (tipo === 'cerrar-compartir') {
      ev.preventDefault();
      document.getElementById('compartir')?.remove();
      return;
    }
    if (tipo === 'compartir-ahora') {
      ev.preventDefault();
      compartirAhora(act.dataset.sap);
      return;
    }
    if (tipo === 'copiar-sap') {
      ev.preventDefault();
      copiar(`${avisoEnlace()}\n${enlaceSap(act.dataset.sap)}`);
      toast('Enlace copiado. Quien lo abra necesita la contraseña.');
      return;
    }
    if (tipo === 'copiar-analisis') {
      ev.preventDefault();
      copiarAnalisis();
      return;
    }
    if (tipo === 'vacios') {
      ev.preventDefault();
      state.vacios = !state.vacios;
      try { localStorage.setItem('fichas-pt-vacios', state.vacios ? '1' : '0'); } catch { /* privado */ }
      renderVista({ foco: false });
      return;
    }
    if (tipo === 'comparar-toggle') {
      ev.preventDefault();
      toggleComparar(act.dataset.sap);
      return;
    }
    if (tipo === 'lb') {
      ev.preventDefault();
      abrirLb(Number(act.dataset.i) || 0);
      return;
    }
    if (tipo === 'lb-close') {
      ev.preventDefault();
      cerrarLb();
      return;
    }
    if (tipo === 'lb-nav') {
      ev.preventDefault();
      moverLb(Number(act.dataset.dir) || 1);
      return;
    }
    if (tipo === 'zoom') {
      ev.preventDefault();
      zoomLb(act.dataset.z);
      return;
    }
  }

  const go = ev.target.closest('a[data-go]');
  if (go) {
    if (modificado(ev)) return;
    ev.preventDefault();
    ir(go.dataset.go);
    return;
  }

  const statGo = ev.target.closest('[data-go]');
  if (statGo && statGo.tagName === 'BUTTON') {
    ev.preventDefault();
    ir(statGo.dataset.go);
    return;
  }

  const a = ev.target.closest('a[href]');
  if (!a || modificado(ev)) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('blob:') || a.hasAttribute('download')) return;
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return;
  ev.preventDefault();
  history.pushState(null, '', `${url.pathname}${url.search}`);
  state.ruta = leerRuta();
  renderVista();
}

function onSubmit(ev) {
  if (ev.target.id === 'login-form') {
    ev.preventDefault();
    if (!state.ocupado) entrar(new FormData(ev.target));
  }
  if (ev.target.id === 'form-buscar') ev.preventDefault();
  if (ev.target.id === 'form-acceso') {
    ev.preventDefault();
    if (!act.ocupado) onAcceso(new FormData(ev.target));
  }
  if (ev.target.id === 'form-pdfs') {
    ev.preventDefault();
    if (!act.ocupado) onPdfs(ev.target);
  }
  if (ev.target.id === 'form-clave-app') {
    ev.preventDefault();
    if (!act.ocupado) onClaveInforme(new FormData(ev.target));
  }
}

function onInput(ev) {
  if (ev.target.classList?.contains('medida-in')) {
    pintarJuicio(ev.target);
    return;
  }
  if (ev.target.id === 'q') {
    onQuery(ev.target.value);
    actualizarSug(ev.target.value);
  }
  if (ev.target.id === 'qm') {
    const pos = ev.target.selectionStart;
    state.qM = ev.target.value;
    state.ruta = { vista: 'materiales' };
    history.replaceState(null, '', construirUrl());
    renderVista({ foco: false });
    const qm = document.getElementById('qm');
    if (qm) {
      qm.focus();
      if (pos != null) qm.setSelectionRange(pos, pos);
    }
  }
  if (ev.target.id === 'qg') {
    const pos = ev.target.selectionStart;
    state.qG = ev.target.value;
    state.ruta = { vista: 'codigos' };
    history.replaceState(null, '', construirUrl());
    renderVista({ foco: false });
    const qg = document.getElementById('qg');
    if (qg) {
      qg.focus();
      if (pos != null) qg.setSelectionRange(pos, pos);
    }
  }
}

function onKeySug(ev) {
  const n = nOpcionesSug();
  if (ev.key === 'ArrowDown' && n) {
    ev.preventDefault();
    state.sug.activa = (state.sug.activa + 1) % n;
    pintarSug();
    return true;
  }
  if (ev.key === 'ArrowUp' && n) {
    ev.preventDefault();
    state.sug.activa = state.sug.activa <= 0 ? n - 1 : state.sug.activa - 1;
    pintarSug();
    return true;
  }
  if (ev.key === 'Escape' && n) {
    ev.preventDefault();
    cerrarSug();
    return true;
  }
  if (ev.key === 'Enter') {
    const i = state.sug.activa;
    if (n && i >= 0) {
      ev.preventDefault();
      if (i < state.sug.items.length) abrirMaterial(state.sug.items[i].codigo);
      else verTodosMateriales(state.sug.q);
      return true;
    }
    const exacto = state.mat && materialExacto(state.mat, ev.target.value);
    if (exacto) {
      ev.preventDefault();
      abrirMaterial(exacto.codigo);
      return true;
    }
    cerrarSug();
  }
  return false;
}

function onKey(ev) {
  if (ev.target?.id === 'q' && onKeySug(ev)) return;
  if (ev.key === '/' && !esCampo(ev.target)) {
    const q = document.getElementById('q');
    if (q) {
      ev.preventDefault();
      q.focus();
    }
  }
  if (!state.lb) return;
  if (ev.key === 'Escape') cerrarLb();
  else if (ev.key === 'ArrowRight') moverLb(1);
  else if (ev.key === 'ArrowLeft') moverLb(-1);
  else if (ev.key === '+' || ev.key === '=') zoomLb(0.25);
  else if (ev.key === '-') zoomLb(-0.25);
}

function abrirDetalles() {
  detallesAntes.clear();
  document.querySelectorAll('#contenido details').forEach((d) => {
    detallesAntes.set(d, d.open);
    d.open = true;
  });
}

function cerrarDetalles() {
  detallesAntes.forEach((abierto, d) => { d.open = abierto; });
  detallesAntes.clear();
}

function enlaceSap(sap) {
  const url = new URL(location.href);
  url.search = `?sap=${encodeURIComponent(sap)}`;
  url.hash = '';
  return url.toString();
}

function avisoEnlace() {
  return 'Enlace a una ficha de producto terminado. Hace falta la contraseña de la aplicación para verla.';
}

function abrirCompartir(sap) {
  document.getElementById('compartir')?.remove();
  const capa = document.createElement('div');
  capa.id = 'compartir';
  capa.innerHTML = htmlCompartir(sap);
  document.body.appendChild(capa);
}

async function compartirAhora(sap) {
  const url = enlaceSap(sap);
  const texto = avisoEnlace();
  if (navigator.share) {
    try {
      await navigator.share({ title: `SAP ${sap} · Fichas Alcolea`, text: texto, url });
      document.getElementById('compartir')?.remove();
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  await copiar(`${texto}\n${url}`);
  toast('Enlace copiado. Quien lo abra necesita la contraseña.');
}

function pintarJuicio(input) {
  const fila = {
    std: input.dataset.std,
    min: input.dataset.min,
    max: input.dataset.max,
  };
  const incidencias = input.dataset.incoherente === '1' ? [{ tipo: 'rango_incoherente_en_pdf' }] : [];
  const resultado = juzgarMedida(fila, input.value, incidencias);
  const caja = input.parentElement?.querySelector('.medida-juicio');
  if (!caja) return;
  caja.textContent = textoJuicio(resultado);
  caja.className = `medida-juicio es-${resultado.estado}`;
}

function copiarAnalisis() {
  const lineas = [];
  document.querySelectorAll('.medida-in').forEach((input) => {
    if (!input.value.trim()) return;
    const juicio = input.parentElement?.querySelector('.medida-juicio')?.textContent || '';
    lineas.push(`${input.dataset.etiqueta || 'Parámetro'}: medido ${input.value}. ${juicio}`.trim());
  });
  if (!lineas.length) {
    toast('No hay valores medidos.');
    return;
  }
  const sap = state.ruta.sap ? `SAP ${state.ruta.sap}` : 'Ficha';
  copiar(`${sap}\n${lineas.join('\n')}`);
}

let escaneo = null;

function cerrarEscaner() {
  if (escaneo) {
    escaneo.parar = true;
    clearTimeout(escaneo.timer);
    escaneo.stream?.getTracks().forEach((pista) => pista.stop());
    escaneo = null;
  }
  document.getElementById('escaner')?.remove();
}

async function abrirEscaner() {
  cerrarEscaner();
  const capa = document.createElement('div');
  capa.id = 'escaner';
  capa.innerHTML = htmlEscaner();
  document.body.appendChild(capa);
  const video = capa.querySelector('video');
  const estado = capa.querySelector('.scan-estado');
  if (!navigator.mediaDevices?.getUserMedia) {
    estado.textContent = 'Este navegador no da acceso a la cámara.';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    video.srcObject = stream;
    await video.play();
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    escaneo = { stream, parar: false, timer: 0 };
    const bucle = async () => {
      if (!escaneo || escaneo.parar) return;
      if (video.readyState >= 2 && video.videoWidth) {
        lienzo.width = video.videoWidth;
        lienzo.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
        try {
          const hallado = await decodificarCanvas(lienzo);
          if (hallado?.texto && escaneo && !escaneo.parar) {
            const codigo = hallado.texto;
            cerrarEscaner();
            aplicarEan(codigo);
            return;
          }
        } catch { /* el siguiente fotograma */ }
      }
      if (escaneo && !escaneo.parar) escaneo.timer = setTimeout(bucle, 320);
    };
    bucle();
  } catch (err) {
    const denegado = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.name === 'SecurityError';
    estado.textContent = denegado
      ? 'No se ha permitido usar la cámara. Puedes autorizarla en los ajustes del navegador y volver a intentarlo.'
      : 'No se ha podido abrir la cámara.';
  }
}

function aplicarEan(codigo) {
  const lista = fichasPorEan(productos(), codigo);
  if (lista.length === 1) {
    ir('producto', { sap: lista[0].codigo_sap });
    return;
  }
  state.ruta = { vista: 'ean', codigo };
  history.pushState(null, '', construirUrl());
  renderVista();
}

async function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    state.swReg = reg;
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      if (!nuevo || !navigator.serviceWorker.controller) return;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed') {
          state.hayActualizacion = true;
          const b = document.getElementById('btn-actualizar');
          if (b) b.hidden = false;
          toast('Hay una versión nueva. Pulsa Actualizar.');
        }
      });
    });
  } catch {
    /* la consulta en línea sigue disponible */
  }
}

async function iniciar() {
  state.vacios = localStorage.getItem('fichas-pt-vacios') === '1';
  state.ruta = leerRuta();
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusout', (ev) => {
    if (ev.target?.id !== 'q') return;
    setTimeout(() => {
      if (!document.activeElement?.closest?.('#form-buscar, #q-sug')) cerrarSug();
    }, 150);
  });
  document.addEventListener('mousedown', (ev) => {
    if (ev.target.closest?.('#q-sug')) ev.preventDefault();
  });
  window.addEventListener('popstate', () => {
    if (!state.listo) return;
    state.ruta = leerRuta();
    renderVista();
    if (state.ruta.vista === 'actualizar') prepararPantallaAct();
  });
  window.addEventListener('beforeprint', abrirDetalles);
  window.addEventListener('afterprint', cerrarDetalles);
  window.addEventListener('online', pintarRed);
  window.addEventListener('offline', pintarRed);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvent = e;
    const b = document.getElementById('btn-instalar');
    if (b) b.hidden = false;
  });
  registrarSW();
  pintarLogin();
  try {
    state.formato = await obtenerFormato();
  } catch {
    state.errorLogin = 'Sin conexión y este dispositivo todavía no tiene las fichas guardadas.';
    pintarLogin();
    return;
  }
  pintarLogin();
  let guardada = null;
  try { guardada = await leerClave(); } catch { guardada = null; }
  if (guardada?.key && guardada.sal_hex !== state.formato.sal_hex) {
    await borrarClave().catch(() => {});
    state.errorLogin = 'Hay fichas nuevas. Escribe la contraseña para abrirlas.';
    pintarLogin();
    return;
  }
  if (guardada?.key) {
    try {
      state.ocupado = true;
      pintarLogin();
      const buf = await obtenerCifrado(state.formato.sha256_datos_enc);
      const paquete = await descifrarConClave(guardada.key, state.formato, buf);
      aplicarPaquete(paquete);
      if (state.ruta.vista === 'actualizar') prepararPantallaAct();
      return;
    } catch {
      await borrarClave().catch(() => {});
      state.ocupado = false;
      state.errorLogin = 'No se ha podido usar la sesión guardada. Escribe la contraseña.';
      pintarLogin();
    }
  }
}

iniciar();
