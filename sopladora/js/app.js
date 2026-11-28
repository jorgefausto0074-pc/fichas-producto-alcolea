import { abrirPaquete, descifrarConClave, derivarClave } from './descifrar.js';
import { borrarClave, guardarClave, leerClave } from './sesion.js';
import { botellaVisible, textoCapacidad, textoGas } from './buscar.js';
import { refrescarFoto } from './foto.js';
import { tramosEscala } from './maqueta.js';
import { anotarCalculo, borrarHistorial, guardarAjuste, guardarMemoria, leerMemoria, quitarComparada, recordarGramaje, vaciarComparacion } from './memoria.js';
import { csvFicha } from './csv.js';
import { contarHasta } from './animar.js';
import {
  calcularAjustado,
  calcularNuevo,
  COLUMNAS_RESUMEN,
  filasResumen,
  formatoGramos,
  formatoPct,
  fueraDeLoHabitual,
  clasificarMedida,
  prepararFicha,
  textoACentesimas,
  textoVariacion,
} from './calculo.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
let plano = { botellas: {} };
fetch('maquetacion.json').then((r) => (r.ok ? r.json() : null)).then((dato) => {
  if (!dato?.botellas) return;
  plano = dato;
  if (state.doc) pintar();
}).catch(() => {});
const CAPACIDADES = ['0,5', '1', '1,5', '2'];

const memoria = leerMemoria();

const state = {
  formato: null,
  doc: null,
  imagenes: null,
  blob: null,
  vista: 'portada',
  q: '',
  gas: 'todas',
  capacidad: 'todas',
  soloFavoritos: false,
  gramajes: new Map(),
  error: '',
  ocupado: false,
  sinDatos: false,
  instalador: null,
  hayNueva: false,
  recargando: false,
};

for (const [id, texto] of Object.entries(memoria.gramajes || {})) {
  if (typeof texto === 'string') state.gramajes.set(id, texto);
}

const urls = new Map();
let entradaIniciada = false;

function edicionTexto() {
  const meta = state.doc?.meta || {};
  const formato = state.formato || {};
  const ed = meta.edicion || formato.edicion;
  const fecha = meta.fecha_portada || formato.fecha_portada;
  return [ed ? `Edición ${ed}` : '', fecha || '', 'Refresco Iberia · Planta Alcolea'].filter(Boolean).join(' · ');
}

function el(tag, attrs = {}, children = []) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2).toLowerCase(), v);
    else nodo.setAttribute(k, v === true ? '' : String(v));
  }
  for (const hijo of [].concat(children)) {
    if (hijo == null || hijo === false) continue;
    nodo.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

function app() {
  return document.getElementById('app');
}

function limpiarUrls() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

function urlImagen(botella) {
  const h = botella.imagen_sha256;
  if (!h || !state.imagenes?.[h]) return '';
  if (urls.has(h)) return urls.get(h);
  const meta = state.imagenes[h];
  const trozo = state.blob.subarray(meta.offset, meta.offset + meta.longitud);
  const url = URL.createObjectURL(new Blob([trozo], { type: meta.mime || 'image/jpeg' }));
  urls.set(h, url);
  return url;
}

function localizar(id) {
  for (const botella of state.doc?.botellas || []) {
    const ficha = botella.fichas.find((f) => f.id === id);
    if (ficha) return { botella, ficha };
  }
  return null;
}

function gramajeDe(ficha) {
  return formatoGramos(prepararFicha(ficha).sumaC);
}

function ruta() {
  const h = (location.hash || '#/').replace(/^#/, '');
  const ficha = h.match(/^\/ficha\/([A-Za-z0-9-]+)$/);
  if (ficha) return { vista: 'ficha', id: ficha[1] };
  if (h === '/medias') return { vista: 'medias' };
  if (h === '/comparar') return { vista: 'comparar', id: null };
  return { vista: 'lista', id: null };
}

function ir(hash) {
  if (location.hash === hash) pintar();
  else location.hash = hash;
}

function logo(clase) {
  return el('img', {
    class: clase || 'logo',
    src: '../img/marca2026/refresco-logo-naranja.png',
    alt: 'Refresco',
  });
}

function pintarPortada() {
  document.body.className = '';
  const seccion = el('section', { class: 'portada', 'data-vista': 'portada' }, [
    el('img', { class: 'portada-burbujas', src: '../img/marca2026/foto-burbujas.webp', alt: '' }),
    el('img', { class: 'portada-circulos', src: '../img/marca2026/circulos-azul.svg', alt: '' }),
    el('img', { class: 'portada-stripe', src: '../img/marca2026/stripe-r-naranja.svg', alt: '' }),
    el('div', { class: 'portada-botella' }, [
      el('img', { src: '../img/marca2026/foto-linea-2.webp', alt: '' }),
    ]),
    el('div', { class: 'portada-centro' }, [
      logo('portada-logo'),
      el('p', { class: 'kicker kicker-clara' }, 'Refresco Iberia · Planta Alcolea'),
      el('h1', {}, 'Calculadora Sopladora'),
      el('p', { class: 'portada-sub' }, 'Zonas de corte de botellas'),
      el('p', { class: 'portada-pie' }, 'Toca para entrar'),
    ]),
  ]);
  app().replaceChildren(el('main', {}, [seccion]));
}

function continuar() {
  if (entradaIniciada) return;
  entradaIniciada = true;
  abrirSesion();
}

async function abrirSesion() {
  try {
    const res = await fetch('formato.json', { cache: 'no-store' });
    if (res.status === 404) {
      state.sinDatos = true;
      pintarAcceso();
      return;
    }
    if (!res.ok) throw new Error('formato');
    state.formato = await res.json();
    state.sinDatos = false;
  } catch {
    state.sinDatos = true;
    state.error = 'No se ha podido leer el formato del paquete.';
    pintarAcceso();
    return;
  }
  try {
    const guardada = await leerClave();
    if (guardada?.key && guardada.sal_hex === state.formato.sal_hex) {
      const buf = await obtenerCifrado();
      const paquete = await descifrarConClave(guardada.key, state.formato, buf);
      aplicarPaquete(paquete);
      return;
    }
  } catch {
    await borrarClave().catch(() => {});
  }
  pintarAcceso();
}

async function obtenerCifrado() {
  const sha = state.formato.sha256_datos_enc;
  const res = await fetch(`datos.enc?v=${encodeURIComponent(sha || '')}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('paquete');
  return res.arrayBuffer();
}

function aplicarPaquete(paquete) {
  if (paquete.indice?.tipo && paquete.indice.tipo !== 'sopladora') {
    throw new Error('paquete');
  }
  state.doc = paquete.doc;
  state.imagenes = paquete.imagenes || {};
  state.blob = paquete.blob;
  state.error = '';
  state.ocupado = false;
  if (!location.hash || location.hash === '#') location.hash = '#/';
  pintar();
}

function pintarAcceso() {
  document.body.className = '';
  state.vista = 'login';
  const tarjeta = el('form', {
    class: `login-card${state.error ? ' sacudir' : ''}`,
    id: 'login-form',
    onsubmit: (ev) => {
      ev.preventDefault();
      entrar(new FormData(ev.target));
    },
  }, [
    logo('login-logo'),
    el('p', { class: 'kicker' }, 'Refresco Iberia · Alcolea'),
    el('h1', {}, 'Calculadora Sopladora'),
    el('p', { class: 'login-sub' }, 'Zonas de corte. La misma contraseña que Fichas de producto.'),
  ]);
  if (state.sinDatos) {
    tarjeta.append(
      el('p', { class: 'hint' }, 'Los datos todavía no están publicados. Hay que cifrar el paquete con la contraseña de la aplicación y subir datos.enc y formato.json.'),
      el('a', { class: 'btn btn-primary', href: 'preparar.html' }, 'Preparar el paquete cifrado'),
    );
  } else {
    tarjeta.append(
      el('label', { for: 'clave' }, 'Contraseña'),
      el('div', { class: 'campo-clave' }, [
        el('input', {
          id: 'clave',
          name: 'clave',
          type: 'password',
          autocomplete: 'current-password',
          required: true,
          'aria-invalid': state.error ? 'true' : 'false',
        }),
        el('button', {
          type: 'button',
          class: 'ver-clave',
          'aria-pressed': 'false',
          'aria-label': 'Mostrar contraseña',
          onclick: (ev) => {
            const campo = document.getElementById('clave');
            const ver = campo.type === 'password';
            campo.type = ver ? 'text' : 'password';
            ev.currentTarget.setAttribute('aria-pressed', ver ? 'true' : 'false');
            ev.currentTarget.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
          },
        }, [ojo()]),
      ]),
      el('label', { class: 'check' }, [
        el('input', { type: 'checkbox', name: 'recordar' }),
        'Recordar en este dispositivo',
      ]),
      el('button', { class: 'btn btn-primary', type: 'submit' }, state.ocupado ? 'Abriendo la calculadora…' : 'Entrar'),
      el('p', { class: 'error', role: 'alert' }, state.error || ''),
    );
  }
  app().replaceChildren(el('main', { class: 'login', 'data-vista': 'login' }, [
    decorado(),
    tarjeta,
  ]));
  document.getElementById('clave')?.focus();
}

function ojo() {
  return el('svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true' }, [
    el('path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' }),
    el('circle', { cx: '12', cy: '12', r: '3' }),
  ]);
}

function decorado() {
  return el('div', { class: 'gate-decor', 'aria-hidden': 'true' }, [
    el('div', { class: 'gate-photo' }, [
      el('img', { src: '../img/marca2026/foto-burbujas.webp', alt: '' }),
    ]),
    el('img', { class: 'gate-stripe', src: '../img/marca2026/stripe-r-naranja.svg', alt: '' }),
    el('img', { class: 'gate-circles', src: '../img/marca2026/circulos-azul.svg', alt: '' }),
    el('div', { class: 'gate-bottles' }, [1, 2, 3].map((i) => el('div', { class: 'gate-bottle', style: `--i:${i}` }, [
      el('img', { src: `../img/marca2026/foto-linea-${i}.webp`, alt: '' }),
    ]))),
  ]);
}

async function entrar(fd) {
  const password = String(fd.get('clave') || '');
  const recordar = fd.get('recordar') != null;
  state.ocupado = true;
  state.error = '';
  pintarAcceso();
  try {
    const key = await derivarClave(password, state.formato);
    const buf = await obtenerCifrado();
    const paquete = await descifrarConClave(key, state.formato, buf);
    if (recordar) await guardarClave(key, { sal_hex: state.formato.sal_hex });
    else await borrarClave().catch(() => {});
    state.ocupado = false;
    aplicarPaquete(paquete);
  } catch (err) {
    state.ocupado = false;
    state.error = err?.name === 'OperationError'
      ? 'Contraseña incorrecta.'
      : 'No se ha podido abrir el paquete. Recarga la página e inténtalo de nuevo.';
    pintarAcceso();
  }
}

async function salir() {
  await borrarClave().catch(() => {});
  limpiarUrls();
  state.doc = null;
  state.imagenes = null;
  state.blob = null;
  state.error = '';
  location.hash = '#/';
  pintarAcceso();
}

function pintar() {
  const hacer = () => pintarAhora();
  if (state.doc && document.startViewTransition && !REDUCE) {
    try { document.startViewTransition(hacer); }
    catch { hacer(); }
  } else {
    hacer();
    const shell = document.querySelector('main.shell');
    if (shell && state.doc && !REDUCE) shell.classList.add('entra');
  }
}

function pintarAhora() {
  if (!state.doc) return;
  document.body.className = memoria.modoLinea ? 'en-app linea' : 'en-app';
  const r = ruta();
  state.vista = r.vista;
  const raiz = el('main', { class: 'shell', 'data-vista': r.vista });
  raiz.append(cabecera());
  if (r.vista === 'medias') raiz.append(vistaMedias());
  else if (r.vista === 'comparar') raiz.append(vistaComparar());
  else if (r.vista === 'ficha') raiz.append(vistaFicha(r.id));
  else raiz.append(vistaLista());
  raiz.append(pie());
  app().replaceChildren(raiz);
  medirCabecera();
}

function medirCabecera() {
  const barra = document.querySelector('.topbar');
  const alto = barra ? Math.ceil(barra.getBoundingClientRect().height) : 0;
  if (alto) document.documentElement.style.setProperty('--cabecera', `${alto}px`);
}

function cabecera() {
  const r = ruta();
  return el('header', { class: 'topbar no-print' }, [
    el('div', { class: 'marca' }, [
      el('img', { src: '../img/marca2026/refresco-r-naranja.png', alt: '', class: 'marca-r' }),
      el('div', {}, [
        el('strong', { class: 'wordmark' }, 'Calculadora Sopladora'),
        el('span', { class: 'marca-sub' }, 'Zonas de corte · Alcolea'),
      ]),
    ]),
    el('nav', { class: 'tabs', 'aria-label': 'Secciones' }, [
      el('button', {
        type: 'button',
        class: r.vista === 'lista' || r.vista === 'ficha' ? 'tab activa' : 'tab',
        onclick: () => ir('#/'),
      }, 'Botellas'),
      el('button', {
        type: 'button',
        class: r.vista === 'medias' ? 'tab activa' : 'tab',
        onclick: () => ir('#/medias'),
      }, [
        el('span', { class: 'tab-corto' }, 'Resumen'),
        el('span', { class: 'tab-largo' }, 'Resumen medidas'),
      ]),
      el('button', {
        type: 'button',
        class: r.vista === 'comparar' ? 'tab activa' : 'tab',
        onclick: () => ir('#/comparar'),
      }, 'Comparar'),
    ]),
    el('div', { class: 'top-acciones' }, [
      el('button', {
        type: 'button',
        class: 'btn btn-ghost solo-ancho',
        'aria-pressed': memoria.modoLinea ? 'true' : 'false',
        onclick: () => {
          memoria.modoLinea = !memoria.modoLinea;
          guardarMemoria(memoria);
          pintar();
        },
      }, 'Modo línea'),
      state.instalador ? el('button', { type: 'button', class: 'btn btn-ghost solo-ancho', onclick: instalar }, 'Instalar') : null,
      state.hayNueva ? el('button', { type: 'button', class: 'btn btn-ghost solo-ancho', onclick: activarNueva }, 'Actualizar la aplicación') : null,
      el('button', { type: 'button', class: 'btn btn-ghost solo-ancho', onclick: salir }, 'Salir'),
      el('button', {
        type: 'button',
        class: 'btn btn-icono solo-estrecho',
        'aria-label': 'Más opciones',
        'aria-expanded': 'false',
        'aria-controls': 'menu-mas',
        onclick: (ev) => {
          const panel = document.getElementById('menu-mas');
          const abierto = panel?.hidden !== false;
          if (panel) panel.hidden = !abierto;
          ev.currentTarget.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        },
      }, '⋯'),
      el('div', { id: 'menu-mas', class: 'menu-panel', hidden: true }, [
        el('button', {
          type: 'button',
          class: 'btn btn-ghost',
          'aria-pressed': memoria.modoLinea ? 'true' : 'false',
          onclick: () => {
            memoria.modoLinea = !memoria.modoLinea;
            guardarMemoria(memoria);
            pintar();
          },
        }, 'Modo línea'),
        state.instalador ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: instalar }, 'Instalar') : null,
        state.hayNueva ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: activarNueva }, 'Actualizar') : null,
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: salir }, 'Salir'),
      ]),
    ]),
  ]);
}

async function instalar() {
  if (!state.instalador) return;
  state.instalador.prompt();
  await state.instalador.userChoice.catch(() => {});
  state.instalador = null;
  pintar();
}

function activarNueva() {
  navigator.serviceWorker?.controller?.postMessage({ tipo: 'skip-waiting' });
}

function pie() {
  return el('footer', { class: 'pie' }, [
    el('span', {}, edicionTexto()),
    el('a', { href: 'preparar.html', class: 'no-print' }, 'Cifrar un paquete nuevo'),
  ]);
}

function vistaLista() {
  const visibles = botellasVisibles();
  const cont = el('section', { class: 'lista' }, [
    el('div', { class: 'buscar-fila no-print' }, [
      el('label', { class: 'sr', for: 'q' }, 'Buscar'),
      el('input', {
        id: 'q',
        class: 'buscar',
        type: 'search',
        placeholder: 'Buscar por nombre, capacidad o gramaje',
        value: state.q,
        autocomplete: 'off',
        oninput: (ev) => {
          state.q = ev.target.value;
          actualizarListado();
        },
      }),
    ]),
    filtros(),
    el('p', { class: 'recuento' }, `${visibles.length} ${visibles.length === 1 ? 'botella' : 'botellas'}`),
  ]);
  cont.append(nodoResultados(visibles));
  return cont;
}

function botellasVisibles() {
  return state.doc.botellas.filter((b) => {
    if (state.soloFavoritos && !b.fichas.some((f) => memoria.favoritos.includes(f.id))) return false;
    return botellaVisible(b, {
      q: state.q,
      gas: state.gas,
      capacidad: state.capacidad,
      gramosDe: gramajeDe,
    });
  });
}

function nodoResultados(visibles) {
  if (!visibles.length) {
    return el('p', { class: 'vacio', 'data-resultados': '1' }, 'Ninguna botella coincide con la búsqueda.');
  }
  const rejilla = el('div', { class: 'rejilla', 'data-resultados': '1' });
  visibles.forEach((botella, i) => rejilla.append(tarjeta(botella, i)));
  return rejilla;
}

function actualizarListado() {
  const visibles = botellasVisibles();
  const rec = document.querySelector('.recuento');
  const viejo = document.querySelector('[data-resultados]');
  if (!rec || !viejo) {
    pintar();
    return;
  }
  rec.textContent = `${visibles.length} ${visibles.length === 1 ? 'botella' : 'botellas'}`;
  viejo.replaceWith(nodoResultados(visibles));
}

function filtros() {
  const grupo = (nombre, valor, opciones, set) => el('div', { class: 'chips', role: 'group', 'aria-label': nombre }, opciones.map((op) => el('button', {
    type: 'button',
    class: valor === op.id ? 'chip activo' : 'chip',
    'aria-pressed': valor === op.id ? 'true' : 'false',
    onclick: () => { set(op.id); pintar(); },
  }, op.texto)));
  return el('div', { class: 'filtros no-print' }, [
    grupo('Gas', state.gas, [
      { id: 'todas', texto: 'Todas' },
      { id: 'con_gas', texto: 'Con gas' },
      { id: 'sin_gas', texto: 'Sin gas' },
    ], (id) => { state.gas = id; }),
    grupo('Capacidad', state.capacidad, [
      { id: 'todas', texto: 'Todas las capacidades' },
      ...CAPACIDADES.map((c) => ({ id: c, texto: textoCapacidad(c) })),
    ], (id) => { state.capacidad = id; }),
    el('button', {
      type: 'button',
      class: state.soloFavoritos ? 'chip activo' : 'chip',
      'aria-pressed': state.soloFavoritos ? 'true' : 'false',
      onclick: () => { state.soloFavoritos = !state.soloFavoritos; pintar(); },
    }, 'Favoritos'),
  ]);
}

function tarjeta(botella, i) {
  const primera = botella.fichas[0];
  const foto = urlImagen(botella);
  const favorita = botella.fichas.some((f) => memoria.favoritos.includes(f.id));
  return el('article', {
    class: 'tarjeta',
    style: REDUCE ? '' : `--d:${i}`,
    onclick: (ev) => {
      if (ev.target.closest('button')) return;
      ir(`#/ficha/${primera.id}`);
    },
  }, [
    foto ? el('img', { src: foto, alt: '', class: 'mini' }) : el('div', { class: 'mini mini-vacia' }),
    el('div', { class: 'tarjeta-cuerpo' }, [
      el('span', { class: `badge ${botella.gas}` }, textoGas(botella.gas)),
      el('span', { class: 'badge cap' }, textoCapacidad(botella.capacidad_l)),
      el('button', {
        type: 'button',
        class: favorita ? 'estrella on' : 'estrella',
        'aria-pressed': favorita ? 'true' : 'false',
        'aria-label': favorita ? 'Quitar de favoritos' : 'Marcar como favorita',
        onclick: (ev) => { ev.stopPropagation(); alternarFavorito(primera.id); },
      }, '★'),
      el('h2', {}, [
        el('button', { type: 'button', class: 'enlace-ficha', onclick: () => ir(`#/ficha/${primera.id}`) }, botella.nombre),
      ]),
      el('p', { class: 'meta' }, `${botella.fichas[0].n_zonas} zonas${botella.fichas.length > 1 ? ` · ${botella.fichas.length} fichas` : ''}`),
      el('p', { class: 'gramaje-grande' }, botella.fichas.map((f) => `${gramajeDe(f)} g`).join(' · ')),
      el('p', { class: 'gramos' }, botella.fichas.map((f) => f.ficha_codigo).join('  ·  ')),
    ]),
  ]);
}

function textoGramaje(ficha, preparada) {
  const guardado = state.gramajes.get(ficha.id);
  if (guardado != null && String(guardado).trim() !== '') return guardado;
  return formatoGramos(preparada.sumaC);
}

function esCero(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  return t === '0' || t === '0.' || /^0\.0+$/.test(t);
}

function ajusteActivo(ficha, preparada, nC) {
  const guardado = memoria.ajustes?.[ficha.id];
  if (!guardado || !String(guardado.texto || '').trim()) return { aplicado: null, mensaje: '' };
  const indice = preparada.zonas.findIndex((z) => z.clave === guardado.zona);
  if (indice < 0) return { aplicado: null, mensaje: '' };
  if (esCero(guardado.texto)) {
    return {
      aplicado: null,
      mensaje: guardado.modo === 'gramos'
        ? 'Los gramos de la zona tienen que ser mayores que 0 y menores que el gramaje total.'
        : 'El porcentaje de la zona tiene que ser mayor que 0 y menor que 100.',
    };
  }
  const pedido = textoACentesimas(guardado.texto);
  if (!pedido.ok) {
    return {
      aplicado: null,
      mensaje: guardado.modo === 'gramos'
        ? 'Escribe los gramos de la zona. Vale la coma o el punto.'
        : 'Escribe el porcentaje de la zona. Vale la coma o el punto.',
    };
  }
  if (guardado.modo === 'pct') {
    if (pedido.centesimas <= 0 || pedido.centesimas >= 10000) {
      return { aplicado: null, mensaje: 'El porcentaje de la zona tiene que ser mayor que 0 y menor que 100.' };
    }
    return {
      aplicado: { indice, modo: 'pct', valor: pedido.centesimas },
      mensaje: pedido.parcial ? 'Se usa el porcentaje entero mientras completas los decimales.' : '',
    };
  }
  if (pedido.centesimas <= 0 || pedido.centesimas >= nC) {
    return { aplicado: null, mensaje: 'Los gramos de la zona tienen que ser mayores que 0 y menores que el gramaje total.' };
  }
  return {
    aplicado: { indice, modo: 'gramos', valor: pedido.centesimas },
    mensaje: pedido.parcial ? 'Se usan los gramos enteros mientras completas los decimales.' : '',
  };
}

function notaAjuste(preparada, info) {
  if (!info?.aplicado) return '';
  const zona = preparada.zonas[info.aplicado.indice];
  if (info.aplicado.modo === 'pct') return `Reparto ajustado: ${zona.nombre} al ${formatoPct(info.aplicado.valor)} %`;
  return `Reparto ajustado: ${zona.nombre} a ${formatoGramos(info.aplicado.valor)} g`;
}

function mismoPatron(preparada, nuevo) {
  return Boolean(nuevo) && !nuevo.ajustado && nuevo.filas.every((f, i) => f.medioC === preparada.zonas[i].medioC);
}

function resolverCalculo(ficha, preparada) {
  const texto = textoGramaje(ficha, preparada);
  const pedido = textoACentesimas(texto);
  if (!pedido.ok) return { texto, pedido, info: { aplicado: null, mensaje: '' }, nuevo: null };
  const info = ajusteActivo(ficha, preparada, pedido.centesimas);
  const calculo = info.aplicado
    ? calcularAjustado(preparada, pedido.centesimas, info.aplicado)
    : { ok: true, ...calcularNuevo(preparada, pedido.centesimas), ajustado: false };
  return { texto, pedido, info, nuevo: calculo.ok ? calculo : null };
}

function vistaFicha(id) {
  const encontrado = localizar(id);
  if (!encontrado) {
    return el('section', {}, [
      el('p', {}, 'No está esa ficha.'),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ir('#/') }, 'Volver al listado'),
    ]);
  }
  const { botella, ficha } = encontrado;
  const preparada = prepararFicha(ficha);
  const resuelto = resolverCalculo(ficha, preparada);
  const { texto, nuevo } = resuelto;
  const sec = el('article', { class: 'ficha', 'data-ficha': ficha.id, 'data-patron': String(preparada.sumaC) }, [
    el('div', { class: 'ficha-nav no-print' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Volver al listado', onclick: () => ir('#/') }, [
        el('span', { class: 'ico-nav', 'aria-hidden': 'true' }, '←'),
        el('span', { class: 'etiq' }, 'Volver'),
      ]),
      el('div', { class: 'ficha-acciones' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': memoria.favoritos.includes(ficha.id) ? 'Quitar de favoritos' : 'Marcar como favorita', 'aria-pressed': memoria.favoritos.includes(ficha.id) ? 'true' : 'false', onclick: () => alternarFavorito(ficha.id) }, [
          el('span', { class: 'ico-nav', 'aria-hidden': 'true' }, memoria.favoritos.includes(ficha.id) ? '★' : '☆'),
          el('span', { class: 'etiq' }, 'Favorita'),
        ]),
        el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Comparar', onclick: () => alternarComparar(ficha.id) }, [
          el('span', { class: 'ico-nav', 'aria-hidden': 'true' }, '⇄'),
          el('span', { class: 'etiq' }, 'Comparar'),
        ]),
        el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Compartir', onclick: () => compartirResultado(botella, ficha, preparada) }, [
          el('span', { class: 'ico-nav', 'aria-hidden': 'true' }, '↗'),
          el('span', { class: 'etiq' }, 'Compartir'),
        ]),
        el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Exportar CSV', onclick: () => exportarCsv(botella, ficha, preparada) }, [
          el('span', { class: 'ico-nav', 'aria-hidden': 'true' }, 'CSV'),
          el('span', { class: 'etiq' }, 'CSV'),
        ]),
        el('button', { type: 'button', class: 'btn btn-primary', 'aria-label': 'Imprimir o guardar PDF', onclick: () => window.print() }, [
          el('span', { class: 'ico-nav', 'aria-hidden': 'true' }, '⎙'),
          el('span', { class: 'etiq' }, 'Imprimir'),
        ]),
      ]),
    ]),
    el('header', { class: 'solo-print print-cab' }, [
      logo('print-logo'),
      el('div', {}, [
        el('strong', {}, 'Calculadora Sopladora'),
        el('span', {}, edicionTexto()),
        el('span', {}, `Impreso el ${new Date().toLocaleDateString('es-ES')}`),
      ]),
    ]),
    el('header', { class: 'ficha-titulo' }, [
      el('p', { class: 'kicker' }, `${textoGas(botella.gas)} · ${textoCapacidad(botella.capacidad_l)} · ${ficha.n_zonas} zonas`),
      el('h1', {}, botella.nombre),
      el('p', { class: 'codigo' }, ficha.ficha_codigo),
    ]),
  ]);
  if (botella.fichas.length > 1) {
    sec.append(el('div', { class: 'chips no-print', role: 'group', 'aria-label': 'Ficha' }, botella.fichas.map((f) => el('button', {
      type: 'button',
      class: f.id === ficha.id ? 'chip activo' : 'chip',
      'aria-pressed': f.id === ficha.id ? 'true' : 'false',
      onclick: () => ir(`#/ficha/${f.id}`),
    }, f.ficha_codigo))));
  }
  const cuerpo = el('div', { class: 'ficha-grid' });
  cuerpo.append(columnaFoto(botella, ficha, preparada, nuevo));
  const datos = el('div', { class: 'ficha-datos' });
  datos.append(calculadora(ficha, texto, preparada));
  datos.append(
    el('h2', {}, 'Gramaje patrón'),
    el('p', { class: 'lead' }, `El objetivo de cada zona es el medio. El gramaje patrón de la ficha es la suma de los medios: ${formatoGramos(preparada.sumaC)} g.`),
    tablaZonas('patrón', preparada.zonas, preparada.pct, preparada),
    el('p', { class: 'suma', 'data-suma-zonas': String(preparada.sumaC) }, `Suma de zonas = ${formatoGramos(preparada.sumaC)} g`),
  );
  const caja = el('div', { id: 'resultado-gramaje' });
  rellenarResultado(caja, ficha, preparada);
  datos.append(caja);
  datos.append(historialFicha());
  if (ficha.notas?.length) {
    datos.append(el('section', { class: 'notas' }, [
      el('h2', {}, 'Notas de la ficha'),
      el('ul', {}, ficha.notas.map((n) => el('li', {}, n))),
    ]));
  }
  cuerpo.append(datos);
  sec.append(cuerpo);
  return sec;
}

function textoCorte(n) {
  const [ent, dec] = String(n).split('.');
  return `${dec ? `${ent},${dec}` : ent} cm`;
}

function textoMm(n) {
  const cents = Math.round(Number(n) * 100);
  return `${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}

function alturasVisor(botella, preparada) {
  const limites = botella.zonas_en_foto?.limites_pct;
  const orden = botella.zonas_en_foto?.orden || [];
  const claves = preparada.zonas.map((z) => z.clave);
  const medido = Array.isArray(limites)
    && limites.length === claves.length + 1
    && orden.length === claves.length
    && orden.every((c, i) => c === claves[i]);
  if (medido) return claves.map((_, i) => limites[i + 1] - limites[i]);
  return claves.map(() => 100 / claves.length);
}

function textoGrueso(zona) {
  if (zona.clave !== 'hombro' && zona.clave !== 'cuerpo') return '';
  if (zona.g_min_mm == null && zona.g_max_mm == null) return '';
  if (zona.g_min_mm != null && zona.g_max_mm != null) {
    return el('span', { class: 'franja-grueso' }, [
      'Hombro grueso ',
      el('span', { class: 'nowrap' }, `${textoMm(zona.g_min_mm)}–${textoMm(zona.g_max_mm)} mm`),
    ]);
  }
  const unico = zona.g_min_mm != null ? zona.g_min_mm : zona.g_max_mm;
  return `Hombro grueso ${textoMm(unico)} mm`;
}

function columnaFoto(botella, ficha, preparada, nuevo) {
  const foto = urlImagen(botella);
  const marco = el('div', { class: 'foto-marco' });
  if (foto) marco.append(el('img', { src: foto, alt: botella.nombre, class: 'foto' }));
  const lay = plano.botellas?.[botella.id] || {};
  const escala = tramosEscala({
    cortes: ficha.cortes_cm,
    nZonas: preparada.zonas.length,
    alturaTotalCm: lay.altura_total_cm,
    bocaPct: lay.boca_pct,
    basePct: lay.base_pct,
  });
  const alturas = escala.aEscala ? null : alturasVisor(botella, preparada);
  const franjas = el('div', { class: 'visor-zonas' });
  if (escala.aEscala) {
    let zona = 0;
    escala.alturas.forEach((tramo) => {
      if (tramo.hueco) {
        franjas.append(el('div', { class: 'franja-hueco', style: `height:${tramo.alto}%;flex:none` }));
        return;
      }
      const z = preparada.zonas[zona];
      const medio = nuevo ? nuevo.filas[zona].medioC : z.medioC;
      franjas.append(el('div', { class: `franja zona-${z.clave}`, style: `height:${tramo.alto}%;flex:none` }, [
        el('span', { class: 'franja-nombre' }, z.nombre),
        el('strong', { 'data-peso': String(zona) }, `${formatoGramos(medio)} g`),
        textoGrueso(z) || null,
      ]));
      zona += 1;
    });
    escala.marcas.forEach((marca) => {
      franjas.append(el('span', { class: 'corte-marca', style: `top:${marca.top}%` }, textoCorte(marca.cm)));
    });
  } else {
    preparada.zonas.forEach((z, i) => {
      const medio = nuevo ? nuevo.filas[i].medioC : z.medioC;
      franjas.append(el('div', { class: `franja zona-${z.clave}`, style: `height:${alturas[i]}%;flex:none` }, [
        el('span', { class: 'franja-nombre' }, z.nombre),
        el('strong', { 'data-peso': String(i) }, `${formatoGramos(medio)} g`),
        textoGrueso(z) || null,
      ]));
    });
    const cortes = [...(ficha.cortes_cm || [])].map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
    let acum = 0;
    cortes.forEach((corte, i) => {
      if (i >= alturas.length - 1) return;
      acum += alturas[i];
      franjas.append(el('span', { class: 'corte-marca', style: `top:${acum}%` }, textoCorte(corte)));
    });
  }
  const visor = el('div', { class: 'visor' }, [marco, franjas]);
  const distinto = nuevo && (nuevo.ajustado || nuevo.filas.some((f, i) => f.medioC !== preparada.zonas[i].medioC));
  const leyenda = el('p', { class: 'leyenda-reparto', 'data-leyenda-reparto': '1' }, [
    distinto ? 'Reparto del gramaje nuevo' : 'Reparto del gramaje patrón',
    escala.aEscala ? '' : ' · No a escala',
  ]);
  const listaCortes = el('p', { class: 'cortes' }, [
    'Alturas de corte: ',
    [...(ficha.cortes_cm || [])].map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => b - a).map((c) => textoCorte(c)).join(' · ') || 'sin cortes',
  ]);
  return el('div', { class: 'col-foto' }, [visor, leyenda, listaCortes]);
}

function tablaZonas(cual, filas, pct, totales, zonasNombre) {
  const tabla = el('table', { class: 'tabla' });
  tabla.append(el('caption', { class: 'sr' }, cual === 'nuevo' ? 'Gramaje nuevo por zona' : 'Gramaje patrón por zona'));
  tabla.append(el('thead', {}, [
    el('tr', {}, ['Zona', 'Mín', 'Medio (objetivo)', 'Máx', '%'].map((t) => el('th', { scope: 'col' }, t))),
  ]));
  const cuerpo = el('tbody');
  filas.forEach((fila, i) => {
    const nombre = fila.nombre || zonasNombre?.[i]?.nombre || '';
    cuerpo.append(el('tr', { 'data-zona': fila.clave || zonasNombre?.[i]?.clave || String(i) }, [
      el('th', { scope: 'row' }, nombre),
      el('td', { class: 'num' }, formatoGramos(fila.minC)),
      el('td', { class: 'num objetivo', 'data-medio': String(fila.medioC), 'data-cent': String(fila.medioC) }, formatoGramos(fila.medioC)),
      el('td', { class: 'num' }, formatoGramos(fila.maxC)),
      el('td', { class: 'num', 'data-pct': String(pct[i]) }, formatoPct(pct[i])),
    ]));
  });
  const sumaPct = pct.reduce((a, b) => a + b, 0);
  cuerpo.append(el('tr', { class: 'total' }, [
    el('th', { scope: 'row' }, 'Total'),
    el('td', { class: 'num' }, formatoGramos(totales.sumaMinC ?? filas.reduce((s, f) => s + f.minC, 0))),
    el('td', { class: 'num objetivo' }, formatoGramos(totales.sumaC)),
    el('td', { class: 'num' }, formatoGramos(totales.sumaMaxC ?? filas.reduce((s, f) => s + f.maxC, 0))),
    el('td', { class: 'num', 'data-pct-total': String(sumaPct) }, formatoPct(sumaPct)),
  ]));
  tabla.append(cuerpo);
  return el('div', { class: 'tabla-scroll' }, [tabla]);
}

function rellenarResultado(caja, ficha, preparada) {
  const { texto, pedido, info, nuevo } = resolverCalculo(ficha, preparada);
  const aviso = nuevo && fueraDeLoHabitual(pedido.centesimas, preparada.sumaC);
  const abierto = caja.querySelector?.('.extremos')?.open;
  const previos = [...(caja.querySelectorAll?.('[data-medio]') || [])].map((n) => n.dataset.cent);
  const previa = caja.querySelector('.comparativa');
  const mismas = previa && previa.dataset.nzonas === String(preparada.zonas.length) && nuevo;
  let seccionCmp = null;
  if (nuevo && mismas) {
    actualizarBarras(previa, preparada, nuevo);
    seccionCmp = previa;
    seccionCmp.remove();
  } else if (nuevo) {
    seccionCmp = comparativa(preparada, nuevo);
    seccionCmp.dataset.nzonas = String(preparada.zonas.length);
  }
  caja.replaceChildren();
  if (pedido.ok && nuevo && !mismoPatron(preparada, nuevo)) {
    const bloques = [
      el('h2', {}, `Gramaje nuevo ${formatoGramos(pedido.centesimas)} g`),
      info.aplicado ? el('p', { class: 'aviso-habitual', role: 'status' }, notaAjuste(preparada, info)) : null,
      pedido.parcial ? el('p', { class: 'hint' }, `Se usan ${formatoGramos(pedido.centesimas)} g mientras completas los decimales.`) : null,
      pedido.redondeado ? el('p', { class: 'hint' }, `Se usan ${formatoGramos(pedido.centesimas)} g, redondeados a 2 decimales.`) : null,
      aviso ? el('p', { class: 'aviso-habitual', role: 'status' }, 'Gramaje fuera de lo habitual para esta botella.') : null,
      tablaZonas('nuevo', nuevo.filas, nuevo.pct, nuevo, preparada.zonas),
      el('p', { class: 'suma', 'data-suma-nueva': String(nuevo.sumaC), 'data-n': String(pedido.centesimas) }, `Suma de zonas = ${formatoGramos(nuevo.sumaC)} g`),
      seccionCmp,
    ].filter(Boolean);
    caja.append(...bloques);
    if (!mismas) crecerBarras(seccionCmp);
    caja.querySelectorAll('[data-medio]').forEach((nodo, i) => {
      if (previos[i] != null) nodo.dataset.cent = previos[i];
      contarHasta(nodo, Number(nodo.dataset.medio), REDUCE);
    });
    const escrito = state.gramajes.get(ficha.id);
    if ((escrito && String(escrito).trim()) || info.aplicado) programarHistorial(ficha, pedido, preparada, info);
  } else if (texto.trim() && !pedido.ok && pedido.motivo !== 'vacio') {
    caja.append(el('p', { class: 'error', role: 'alert' }, 'Escribe el gramaje en gramos. Vale la coma o el punto: 40,4 o 40.4.'));
  }
  caja.append(pesosMedidos(ficha, preparada, nuevo));
  const extremos = recuadroExtremos(ficha, preparada, nuevo);
  if (abierto) extremos.open = true;
  caja.append(extremos);
  const leyenda = caja.closest('article.ficha')?.querySelector('[data-leyenda-reparto]');
  if (leyenda) leyenda.textContent = nuevo ? 'Reparto del gramaje nuevo' : 'Reparto del gramaje patrón';
  refrescarFoto(caja, preparada, nuevo);
  const campo = document.getElementById('nuevo-gramaje');
  if (campo) campo.setAttribute('aria-invalid', texto.trim() && !pedido.ok ? 'true' : 'false');
  const avisoAjuste = document.getElementById('aviso-ajuste');
  if (avisoAjuste) avisoAjuste.textContent = info.mensaje || '';
}

function aplicarAjuste(ficha, preparada, parcial) {
  guardarAjuste(memoria, ficha.id, parcial);
  const caja = document.getElementById('resultado-gramaje');
  if (caja) rellenarResultado(caja, ficha, preparada);
}

function calculadora(ficha, texto, preparada) {
  const guardado = memoria.ajustes?.[ficha.id] || { zona: preparada.zonas[0]?.clave || '', modo: 'pct', texto: '' };
  const actualizar = (parcial) => {
    const zona = document.getElementById('ajuste-zona')?.value || guardado.zona;
    const modo = document.querySelector('[data-modo-ajuste].activo')?.dataset.modoAjuste || guardado.modo || 'pct';
    const valor = document.getElementById('ajuste-valor')?.value ?? '';
    aplicarAjuste(ficha, preparada, valor.trim() ? { zona, modo, texto: valor } : null);
    if (parcial) return;
  };
  return el('form', {
    class: 'calculadora no-print',
    onsubmit: (ev) => ev.preventDefault(),
  }, [
    el('div', { class: 'calc-par' }, [
      el('div', {}, [
        el('h2', {}, 'Nuevo gramaje'),
        el('label', { for: 'nuevo-gramaje' }, 'Gramaje total nuevo (g)'),
        el('div', { class: 'calc-fila' }, [
          el('input', {
            id: 'nuevo-gramaje',
            inputmode: 'decimal',
            autocomplete: 'off',
            placeholder: 'Por ejemplo 40,4',
            value: texto,
            oninput: (ev) => {
              state.gramajes.set(ficha.id, ev.target.value);
              recordarGramaje(memoria, ficha.id, ev.target.value);
              const caja = document.getElementById('resultado-gramaje');
              if (caja) rellenarResultado(caja, ficha, preparada);
            },
          }),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost',
            onclick: () => {
              state.gramajes.delete(ficha.id);
              recordarGramaje(memoria, ficha.id, '');
              const campo = document.getElementById('nuevo-gramaje');
              if (campo) campo.value = formatoGramos(preparada.sumaC);
              const caja = document.getElementById('resultado-gramaje');
              if (caja) rellenarResultado(caja, ficha, preparada);
            },
          }, 'Restablecer'),
        ]),
      ]),
      el('div', {}, [
        el('h2', {}, 'Ajuste de una zona'),
        el('label', { for: 'ajuste-zona' }, 'Zona que se fija'),
        el('select', {
          id: 'ajuste-zona',
          onchange: () => actualizar(),
        }, preparada.zonas.map((z) => el('option', { value: z.clave, selected: z.clave === guardado.zona }, z.nombre))),
        el('div', { class: 'chips', role: 'group', 'aria-label': 'Unidad del ajuste' }, [
          el('button', {
            type: 'button',
            class: (guardado.modo || 'pct') === 'pct' ? 'chip activo' : 'chip',
            'data-modo-ajuste': 'pct',
            'aria-pressed': (guardado.modo || 'pct') === 'pct' ? 'true' : 'false',
            onclick: (ev) => {
              ev.currentTarget.parentElement.querySelectorAll('[data-modo-ajuste]').forEach((b) => {
                b.classList.toggle('activo', b === ev.currentTarget);
                b.setAttribute('aria-pressed', b === ev.currentTarget ? 'true' : 'false');
              });
              actualizar();
            },
          }, '%'),
          el('button', {
            type: 'button',
            class: guardado.modo === 'gramos' ? 'chip activo' : 'chip',
            'data-modo-ajuste': 'gramos',
            'aria-pressed': guardado.modo === 'gramos' ? 'true' : 'false',
            onclick: (ev) => {
              ev.currentTarget.parentElement.querySelectorAll('[data-modo-ajuste]').forEach((b) => {
                b.classList.toggle('activo', b === ev.currentTarget);
                b.setAttribute('aria-pressed', b === ev.currentTarget ? 'true' : 'false');
              });
              actualizar();
            },
          }, 'Gramos'),
        ]),
        el('label', { for: 'ajuste-valor' }, 'Valor de la zona fijada'),
        el('input', {
          id: 'ajuste-valor',
          inputmode: 'decimal',
          autocomplete: 'off',
          placeholder: '37 o 12',
          value: guardado.texto || '',
          oninput: () => actualizar(true),
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost',
          onclick: () => {
            const campo = document.getElementById('ajuste-valor');
            if (campo) campo.value = '';
            aplicarAjuste(ficha, preparada, null);
          },
        }, 'Restablecer reparto'),
        el('p', { id: 'aviso-ajuste', class: 'error', role: 'alert' }, ''),
      ]),
    ]),
    el('p', { class: 'hint' }, 'Cada zona conserva el mismo margen en gramos que la ficha patrón. Si fijas una zona, el resto reparte lo que queda del total según sus porcentajes originales. La suma de los medios es exactamente el gramaje escrito.'),
  ]);
}

function comparativa(preparada, nuevo) {
  const maximo = Math.max(
    ...preparada.zonas.map((z) => z.medioC),
    ...nuevo.filas.map((f) => f.medioC),
    1,
  );
  const lista = el('div', { class: 'cmp' });
  preparada.zonas.forEach((z, i) => {
    const linea = textoVariacion(preparada, nuevo, i);
    const antes = linea.antes;
    const despues = linea.despues;
    lista.append(el('div', { class: 'cmp-zona' }, [
      el('div', { class: 'cmp-nombre' }, [
        el('span', { class: `punto zona-${z.clave}` }),
        el('strong', {}, z.nombre),
        el('span', { class: 'variacion', 'data-variacion': String(i) }, linea.texto),
        el('span', { class: linea.delta === 0 ? 'delta cero' : 'delta' }, `${formatoGramos(linea.delta, { signo: true })} g`),
      ]),
      el('div', { class: 'cmp-barras' }, [
        barra('Patrón', antes, maximo, 'antes'),
        barra('Nuevo', despues, maximo, 'despues'),
      ]),
    ]));
  });
  return el('section', { class: 'comparativa' }, [
    el('h2', {}, 'Patrón y gramaje nuevo'),
    lista,
  ]);
}

function barra(etiqueta, valor, maximo, clase) {
  const ancho = Math.max(2, Math.round((valor / maximo) * 100));
  return el('div', { class: 'cmp-linea' }, [
    el('span', { class: 'cmp-etiq' }, etiqueta),
    el('span', { class: 'cmp-pista' }, [
      el('span', { class: `cmp-relleno ${clase}`, 'data-ancho': String(ancho), style: 'width:0%' }),
    ]),
        el('span', { class: 'num', 'data-cent': String(valor) }, formatoGramos(valor)),
  ]);
}

function extremosAlerta(ficha, preparada, nuevo) {
  const medidos = memoria.medidos?.[ficha.id] || {};
  return preparada.zonas.some((z, i) => {
    const lim = nuevo ? nuevo.filas[i] : z;
    return clasificarMedida(medidos[z.clave] || '', lim.minC, lim.maxC) === 'extremo';
  });
}

function recuadroExtremos(ficha, preparada, nuevo) {
  const filas = preparada.zonas.map((z, i) => ({
    nombre: z.nombre,
    minMin: z.minMinC,
    maxMax: z.maxMaxC,
    minMinN: nuevo ? nuevo.filas[i].minMinC : null,
    maxMaxN: nuevo ? nuevo.filas[i].maxMaxC : null,
  }));
  filas.push({
    nombre: 'Total',
    minMin: preparada.sumaMinC - 20,
    maxMax: preparada.sumaMaxC + 20,
    minMinN: nuevo ? nuevo.filas.reduce((s, f) => s + f.minC, 0) - 20 : null,
    maxMaxN: nuevo ? nuevo.filas.reduce((s, f) => s + f.maxC, 0) + 20 : null,
  });
  const tabla = el('table', { class: 'tabla extremos-tabla' });
  const cabezas = ['Zona', 'Mín-Mín patrón', 'Máx-Máx patrón'];
  if (nuevo) cabezas.push('Mín-Mín nuevo', 'Máx-Máx nuevo');
  tabla.append(el('thead', {}, [el('tr', {}, cabezas.map((t) => el('th', { scope: 'col' }, t)))]));
  const cuerpo = el('tbody');
  for (const fila of filas) {
    const celdas = [
      el('th', { scope: 'row' }, fila.nombre),
      el('td', { class: 'num' }, formatoGramos(fila.minMin)),
      el('td', { class: 'num' }, formatoGramos(fila.maxMax)),
    ];
    if (nuevo) {
      celdas.push(el('td', { class: 'num' }, formatoGramos(fila.minMinN)));
      celdas.push(el('td', { class: 'num' }, formatoGramos(fila.maxMaxN)));
    }
    cuerpo.append(el('tr', {}, celdas));
  }
  tabla.append(cuerpo);
  return el('details', { class: extremosAlerta(ficha, preparada, nuevo) ? 'extremos alerta' : 'extremos' }, [
    el('summary', {}, [
      el('span', { class: 'aviso-ico', 'aria-hidden': 'true' }, '!'),
      'Valor extremo / excepcional',
    ]),
    el('p', {}, 'Mín-Mín es el mínimo menos 0,20 g y Máx-Máx es el máximo más 0,20 g. Solo para una situación excepcional. No son el objetivo de trabajo.'),
    el('div', { class: 'tabla-scroll' }, [tabla]),
  ]);
}

function celdaPct(valor, clave) {
  if (valor == null) return el('td', { class: 'num pct-celda' }, '—');
  return el('td', { class: 'num pct-celda', 'data-pct': String(valor) }, [
    clave ? el('span', { class: `mini-pct zona-${clave}`, 'aria-hidden': 'true' }) : null,
    formatoPct(valor),
  ]);
}

function textoCortesCompacto(cortes) {
  const nums = [...(cortes || [])].map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
  if (!nums.length) return '—';
  const cuerpo = nums.map((n) => {
    const [ent, dec] = String(n).split('.');
    return dec ? `${ent},${dec}` : ent;
  }).join(' · ');
  return `${cuerpo} cm`;
}

function vistaMedias() {
  const bloques = filasResumen(state.doc);
  const sec = el('section', { class: 'medias' }, [
    el('h1', {}, 'Resumen medidas'),
    el('p', { class: 'lead' }, 'Cada porcentaje es el medio de la zona partido por la suma de los medios de esa ficha. Las distancias de corte están en cm.'),
  ]);
  const tabla = el('table', { class: 'tabla tabla-resumen' });
  tabla.append(el('caption', { class: 'sr' }, 'Resumen de medidas, con gas y sin gas'));
  tabla.append(el('thead', {}, [el('tr', {}, [
    el('th', { scope: 'col' }, 'Referencia'),
    el('th', { scope: 'col' }, 'Capacidad'),
    el('th', { scope: 'col' }, 'Gramaje'),
    el('th', { scope: 'col' }, 'Cortes'),
    ...COLUMNAS_RESUMEN.map((col) => el('th', { scope: 'col', class: 'th-zona' }, [
      el('span', { class: `barra-zona zona-${col.id}` }),
      col.titulo,
    ])),
  ])]));
  const cuerpo = el('tbody');
  for (const bloque of bloques) {
    cuerpo.append(el('tr', { class: `bloque-gas ${bloque.gas}` }, [
      el('th', { scope: 'row', colspan: String(4 + COLUMNAS_RESUMEN.length) }, bloque.titulo.toUpperCase()),
    ]));
    for (const fila of bloque.filas) {
      const suma = fila.pct.reduce((s, v) => s + (v || 0), 0);
      cuerpo.append(el('tr', { 'data-resumen': fila.id, 'data-suma-pct': String(suma) }, [
        el('th', { scope: 'row', class: 'ref-celda' }, [
          el('button', { type: 'button', class: 'enlace-ficha', onclick: () => ir(`#/ficha/${fila.id}`) }, fila.nombre),
          el('span', { class: 'codigo-mini' }, fila.codigo),
        ]),
        el('td', { class: 'cap-celda' }, textoCapacidad(fila.capacidad)),
        el('td', { class: 'num' }, `${formatoGramos(fila.gramajeC)} g`),
        el('td', { class: 'cortes-celda' }, textoCortesCompacto(fila.cortes)),
        ...fila.pct.map((v, i) => celdaPct(v, COLUMNAS_RESUMEN[i].id)),
      ]));
    }
    cuerpo.append(el('tr', { class: 'media-bloque' }, [
      el('th', { scope: 'row' }, `Media · ${bloque.n} ${bloque.n === 1 ? 'ficha' : 'fichas'}`),
      el('td', {}, '—'),
      el('td', {}, '—'),
      el('td', {}, '—'),
      ...bloque.media.map((m) => (m
        ? el('td', { class: 'num' }, `${formatoPct(m.media)} · ${m.n}`)
        : el('td', { class: 'num' }, '—'))),
    ]));
  }
  tabla.append(cuerpo);
  sec.append(
    el('div', { class: 'resumen-scroll' }, [tabla]),
    el('p', { class: 'hint' }, 'La media de cada bloque sale de las fichas que tienen esa zona. Una celda vacía, con raya, es una zona que esa ficha no usa. Pulsa el nombre para abrir la ficha.'),
  );
  return sec;
}

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          state.hayNueva = true;
          if (state.doc) pintar();
        }
      });
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (state.recargando) return;
    state.recargando = true;
    location.reload();
  });
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  state.instalador = ev;
  if (state.doc) pintar();
});

window.addEventListener('hashchange', () => {
  if (state.doc) pintar();
});
window.addEventListener('resize', () => {
  if (state.doc) medirCabecera();
});

window.addEventListener('beforeprint', () => {
  document.querySelectorAll('details.extremos').forEach((d) => {
    d.dataset.estaba = d.open ? '1' : '0';
    d.open = true;
  });
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details.extremos').forEach((d) => {
    if (d.dataset.estaba !== '1') d.open = false;
  });
});

function crecerBarras(sec) {
  if (!sec) return;
  const aplicar = () => sec.querySelectorAll('[data-ancho]').forEach((n) => {
    n.style.width = `${n.dataset.ancho}%`;
  });
  if (REDUCE) aplicar();
  else requestAnimationFrame(aplicar);
}

function actualizarBarras(sec, preparada, nuevo) {
  const maximo = Math.max(
    ...preparada.zonas.map((z) => z.medioC),
    ...nuevo.filas.map((f) => f.medioC),
    1,
  );
  sec.querySelectorAll('.cmp-zona').forEach((zona, i) => {
    const linea = textoVariacion(preparada, nuevo, i);
    const antes = linea.antes;
    const despues = linea.despues;
    const variacion = zona.querySelector('.variacion');
    if (variacion) variacion.textContent = linea.texto;
    const marca = zona.querySelector('.delta');
    if (marca) {
      marca.textContent = `${formatoGramos(linea.delta, { signo: true })} g`;
      marca.className = linea.delta === 0 ? 'delta cero' : 'delta';
    }
    const rellenos = zona.querySelectorAll('.cmp-relleno');
    const nums = zona.querySelectorAll('.num');
    [antes, despues].forEach((valor, k) => {
      const ancho = Math.max(2, Math.round((valor / maximo) * 100));
      if (rellenos[k]) {
        rellenos[k].dataset.ancho = String(ancho);
        rellenos[k].style.width = `${ancho}%`;
      }
      if (nums[k]) contarHasta(nums[k], valor, REDUCE);
    });
  });
}

function pesosMedidos(ficha, preparada, nuevo) {
  return el('section', { class: 'medidos' }, [
    el('h2', {}, 'Peso medido'),
    el('p', { class: 'hint' }, 'Opcional. Naranja si sale de mínimo y máximo. Resaltado fuerte si sale del valor extremo.'),
    ...preparada.zonas.map((z, i) => {
      const lim = nuevo ? nuevo.filas[i] : z;
      const guardado = memoria.medidos[ficha.id]?.[z.clave] || '';
      const juicio = clasificarMedida(guardado, lim.minC, lim.maxC);
      return el('label', { class: `medido ${juicio}` }, [
        el('span', {}, z.nombre),
        el('input', {
          inputmode: 'decimal',
          value: guardado,
          'aria-label': `Peso medido de ${z.nombre}`,
          oninput: (ev) => {
            memoria.medidos[ficha.id] = memoria.medidos[ficha.id] || {};
            memoria.medidos[ficha.id][z.clave] = ev.target.value;
            guardarMemoria(memoria);
            const juicioNuevo = clasificarMedida(ev.target.value, lim.minC, lim.maxC);
            const fila = ev.target.closest('.medido');
            fila.className = `medido ${juicioNuevo}`;
            fila.querySelector('.juicio').textContent = textoJuicio(juicioNuevo);
            document.querySelector('details.extremos')?.classList.toggle('alerta', extremosAlerta(ficha, preparada, nuevo));
          },
        }),
        el('span', { class: 'juicio' }, textoJuicio(juicio)),
      ]);
    }),
  ]);
}

let historialTimer = 0;
function programarHistorial(ficha, pedido, preparada, info) {
  clearTimeout(historialTimer);
  if (!pedido.ok || pedido.parcial) return;
  const n = formatoGramos(pedido.centesimas);
  const nota = notaAjuste(preparada, info);
  const ajuste = info?.aplicado ? { ...(memoria.ajustes?.[ficha.id] || {}) } : null;
  historialTimer = setTimeout(() => {
    anotarCalculo(memoria, {
      fecha: new Date().toISOString(),
      fichaId: ficha.id,
      codigo: ficha.ficha_codigo,
      n,
      nota,
      ajuste,
    });
    refrescarHistorial(document.querySelector('article.ficha'));
  }, 450);
}

function textoJuicio(juicio) {
  if (juicio === 'fuera') return 'Fuera de mínimo y máximo';
  if (juicio === 'extremo') return 'Fuera del valor extremo';
  if (juicio === 'dentro') return 'Dentro del margen de trabajo';
  return '';
}

function itemHistorial(h, i) {
  return el('div', { class: 'historial-item' }, [
    el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      onclick: () => {
        state.gramajes.set(h.fichaId, String(h.n).replace('.', ','));
        recordarGramaje(memoria, h.fichaId, state.gramajes.get(h.fichaId));
        guardarAjuste(memoria, h.fichaId, h.ajuste || null);
        ir(`#/ficha/${h.fichaId}`);
      },
    }, `${new Date(h.fecha).toLocaleString('es-ES')} · ${h.codigo} · ${h.n} g${h.nota ? ` · ${h.nota}` : ''}`),
    el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      onclick: () => { borrarHistorial(memoria, i); pintar(); },
    }, 'Borrar'),
  ]);
}

function refrescarHistorial(raiz) {
  const sec = raiz?.querySelector('.historial');
  const lista = sec?.querySelector('.historial-lista');
  if (!lista) return;
  lista.replaceChildren(...memoria.historial.map((h, i) => itemHistorial(h, i)));
  sec.querySelector('.hint')?.remove();
  if (!memoria.historial.length) {
    sec.append(el('p', { class: 'hint' }, 'Todavía no hay cálculos guardados en este dispositivo.'));
  } else if (!sec.querySelector('[data-borrar-historial]')) {
    sec.append(el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      'data-borrar-historial': '1',
      onclick: () => { borrarHistorial(memoria, null); pintar(); },
    }, 'Borrar historial'));
  }
}

function historialFicha() {
  const sec = el('section', { class: 'historial' }, [
    el('h2', {}, 'Últimos cálculos'),
    el('div', { class: 'historial-lista' }),
  ]);
  refrescarHistorial(el('div', {}, [sec]));
  return sec;
}

function filasExportables(ficha, preparada) {
  const resuelto = resolverCalculo(ficha, preparada);
  const nuevo = resuelto.nuevo;
  const origen = nuevo
    ? nuevo.filas.map((f, i) => ({ ...f, nombre: preparada.zonas[i].nombre, pct: nuevo.pct[i] }))
    : preparada.zonas.map((z, i) => ({ ...z, pct: preparada.pct[i] }));
  return { origen, pedido: resuelto.pedido, nota: notaAjuste(preparada, resuelto.info) };
}

function exportarCsv(botella, ficha, preparada) {
  const { origen, nota } = filasExportables(ficha, preparada);
  const csv = csvFicha({ titulo: `${botella.nombre} · ${ficha.ficha_codigo}`, filas: origen, nota });
  const nombre = 'zonas-corte.csv';
  const puente = globalThis.SopladoraAndroid;
  if (puente?.guardarArchivo) {
    puente.guardarArchivo(nombre, 'text/csv', btoa(unescape(encodeURIComponent(csv))));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  a.click();
}

async function compartirResultado(botella, ficha, preparada) {
  const { origen, pedido, nota } = filasExportables(ficha, preparada);
  const lineas = origen.map((f) => `${f.nombre}: ${formatoGramos(f.medioC)} g`);
  const texto = [`${botella.nombre}`, ficha.ficha_codigo, pedido.ok ? `Gramaje ${formatoGramos(pedido.centesimas)} g` : 'Gramaje patrón', nota, ...lineas].filter(Boolean).join('\n');
  if (navigator.share) {
    try {
      await navigator.share({ title: botella.nombre, text: texto });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  try { await navigator.clipboard.writeText(texto); } catch { /* el dispositivo no permite copiar */ }
}

function alternarFavorito(id) {
  const i = memoria.favoritos.indexOf(id);
  if (i >= 0) memoria.favoritos.splice(i, 1);
  else memoria.favoritos.push(id);
  guardarMemoria(memoria);
  pintar();
}

function alternarComparar(id) {
  const i = memoria.comparar.indexOf(id);
  if (i >= 0) memoria.comparar.splice(i, 1);
  else memoria.comparar = [...memoria.comparar, id].slice(-2);
  guardarMemoria(memoria);
  ir('#/comparar');
}

function quitarDeComparacion(id) {
  quitarComparada(memoria, id);
  if (ruta().vista === 'comparar') pintar();
  else ir('#/comparar');
}

function vaciarDeComparacion() {
  vaciarComparacion(memoria);
  pintar();
}

function vistaComparar() {
  const ids = memoria.comparar || [];
  const sec = el('section', { class: 'comparar-fichas' }, [
    el('h1', {}, 'Comparar fichas'),
    el('p', { class: 'lead' }, 'Elige hasta dos fichas con el botón Comparar. Quitar deja sitio para otra.'),
    ids.length ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: vaciarDeComparacion }, 'Vaciar comparación') : null,
  ]);
  if (!ids.length) return sec;
  const rejilla = el('div', { class: 'comparar-grid' });
  for (const id of ids) {
    const encontrado = localizar(id);
    if (!encontrado) continue;
    const { botella, ficha } = encontrado;
    const preparada = prepararFicha(ficha);
    const resuelto = resolverCalculo(ficha, preparada);
    const nuevo = resuelto.nuevo;
    rejilla.append(el('article', { class: 'comparar-panel' }, [
      el('h2', {}, botella.nombre),
      el('p', {}, ficha.ficha_codigo),
      tablaZonas('patrón', preparada.zonas, preparada.pct, preparada),
      nuevo && !mismoPatron(preparada, nuevo) ? tablaZonas('nuevo', nuevo.filas, nuevo.pct, nuevo, preparada.zonas) : null,
      el('div', { class: 'ficha-nav' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ir(`#/ficha/${id}`) }, 'Abrir ficha'),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => quitarDeComparacion(id) }, 'Quitar'),
      ]),
    ]));
  }
  sec.append(rejilla);
  return sec;
}

function arrancar() {
  registrarSW();
  if (sessionStorage.getItem('sopladora-portada')) {
    abrirSesion();
    return;
  }
  sessionStorage.setItem('sopladora-portada', '1');
  pintarPortada();
  const espera = REDUCE ? 400 : 2000;
  const timer = setTimeout(continuar, espera);
  const saltar = (ev) => {
    if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
    clearTimeout(timer);
    continuar();
  };
  app().addEventListener('click', saltar);
  app().addEventListener('keydown', saltar);
}

arrancar();
