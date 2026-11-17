import { derivarClave, descifrarConClave } from './descifrar.js';
import { guardarClave, leerClave, borrarClave } from './sesion.js';
import { obtenerFormato, obtenerCifrado, indexar } from './cargar.js';
import { filtrar } from './buscar.js';
import { agruparMarcas, compactar, esCodigoG, fechaPaquete, ordenFecha, CASILLAS } from './util.js';
import { contarValores } from './buscar.js';
import {
  htmlLogin, htmlShell, htmlInicio, htmlBuscar, htmlResultados, htmlProducto,
  htmlComparar, htmlCodigos, htmlCodigoG, htmlLightbox, htmlDock,
  htmlNovedades, htmlResultadoEan, htmlEscaner, htmlCompartir,
} from './vistas.js';
import { fichasPorEan } from './ean.js';
import { decodificarCanvas } from './escaner.js';
import {
  favoritos, toggleFavorito, limpiarFavoritos, recientes, anotarReciente,
  limpiarRecientes, fijarPlanta, aplicarPlantaGuardada, esFavorito,
} from './preferencias.js';
import { juzgarMedida, textoJuicio } from './analisis.js';

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
};

const urls = new Map();
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
  else if (r.vista === 'ean' && r.codigo) p.set('ean', r.codigo);
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
  const vista = q.get('vista');
  if (vista === 'novedades') return { vista: 'novedades' };
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
  const resultados = filtrar(productos(), { q: state.q, ...state.filtros });
  return {
    q: state.q,
    filtros: state.filtros,
    resultados,
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
  if (r.vista === 'ean') {
    const lista = fichasPorEan(productos(), r.codigo);
    return htmlResultadoEan({ codigo: r.codigo, productosLista: lista });
  }
  if (r.vista === 'codigos') return htmlCodigos({ ...listaCodigos(), q: state.qG });
  if (r.vista === 'g') {
    const hallado = productosMezcla(r.codigo);
    return htmlCodigoG(hallado);
  }
  return htmlInicio(datosInicio());
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
  else if (r.vista === 'ean') t = 'Código de barras';
  else if (r.vista === 'codigos') t = 'Códigos G';
  else if (r.vista === 'g') t = r.codigo;
  document.title = `${t} · Fichas Alcolea`;
}

function marcarTabs() {
  const mapa = { g: 'codigos', producto: 'buscar', ean: 'buscar' };
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
  el.innerHTML = htmlResultados(ctxBuscar());
  observarThumbs(el);
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
  state.imagenes = paquete.imagenes;
  state.blob = paquete.blob;
  const idx = indexar(paquete.doc);
  state.porSap = idx.porSap;
  state.porMezcla = idx.porMezcla;
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
    aplicarPaquete(paquete);
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

function ir(vista, extra = {}, { replace = false } = {}) {
  if (vista === 'inicio') {
    state.q = '';
    state.filtros = filtroVacio();
    const input = document.getElementById('q');
    if (input) input.value = '';
  }
  state.ruta = { vista, ...extra };
  history[replace ? 'replaceState' : 'pushState'](null, '', construirUrl());
  renderVista();
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
  const act = ev.target.closest('[data-act]');
  if (act) {
    const tipo = act.dataset.act;
    if (tipo === 'salir') {
      ev.preventDefault();
      salir();
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
  if (href.startsWith('http') || href.startsWith('mailto:')) return;
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
}

function onInput(ev) {
  if (ev.target.classList?.contains('medida-in')) {
    pintarJuicio(ev.target);
    return;
  }
  if (ev.target.id === 'q') onQuery(ev.target.value);
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

function onKey(ev) {
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
  window.addEventListener('popstate', () => {
    if (!state.listo) return;
    state.ruta = leerRuta();
    renderVista();
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
