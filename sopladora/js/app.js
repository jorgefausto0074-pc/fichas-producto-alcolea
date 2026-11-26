import { abrirPaquete, descifrarConClave, derivarClave } from './descifrar.js';
import { borrarClave, guardarClave, leerClave } from './sesion.js';
import { botellaVisible, textoCapacidad, textoGas } from './buscar.js';
import {
  calcularNuevo,
  fichasPlanas,
  formatoGramos,
  formatoPct,
  fueraDeLoHabitual,
  mediasCalculadas,
  nombreZonaVisible,
  ORDEN_ZONA,
  prepararFicha,
  textoACentesimas,
} from './calculo.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAPACIDADES = ['0,5', '1', '1,5', '2'];

const state = {
  formato: null,
  doc: null,
  imagenes: null,
  blob: null,
  vista: 'portada',
  q: '',
  gas: 'todas',
  capacidad: 'todas',
  gramajes: new Map(),
  error: '',
  ocupado: false,
  sinDatos: false,
  instalador: null,
  hayNueva: false,
  recargando: false,
};

const urls = new Map();
let entradaIniciada = false;

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
  app().replaceChildren(seccion);
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
  if (!state.doc) return;
  document.body.className = 'en-app';
  const r = ruta();
  state.vista = r.vista;
  const raiz = el('div', { class: 'shell', 'data-vista': r.vista });
  raiz.append(cabecera());
  if (r.vista === 'medias') raiz.append(vistaMedias());
  else if (r.vista === 'ficha') raiz.append(vistaFicha(r.id));
  else raiz.append(vistaLista());
  raiz.append(pie());
  app().replaceChildren(raiz);
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
      }, 'Medias'),
    ]),
    el('div', { class: 'top-acciones' }, [
      state.instalador ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: instalar }, 'Instalar') : null,
      state.hayNueva ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: activarNueva }, 'Actualizar la aplicación') : null,
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: salir }, 'Salir'),
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
    el('span', {}, 'Edición 15 · 24/11/2026 · Refresco Iberia · Planta Alcolea'),
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
  return state.doc.botellas.filter((b) => botellaVisible(b, {
    q: state.q,
    gas: state.gas,
    capacidad: state.capacidad,
    gramosDe: gramajeDe,
  }));
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
  ]);
}

function tarjeta(botella, i) {
  const primera = botella.fichas[0];
  const foto = urlImagen(botella);
  return el('button', {
    type: 'button',
    class: 'tarjeta',
    style: REDUCE ? '' : `--d:${i}`,
    onclick: () => ir(`#/ficha/${primera.id}`),
  }, [
    foto ? el('img', { src: foto, alt: '', class: 'mini' }) : el('div', { class: 'mini mini-vacia' }),
    el('div', { class: 'tarjeta-cuerpo' }, [
      el('span', { class: `badge ${botella.gas}` }, textoGas(botella.gas)),
      el('span', { class: 'badge cap' }, textoCapacidad(botella.capacidad_l)),
      el('h2', {}, botella.nombre),
      el('p', { class: 'meta' }, `${botella.fichas[0].n_zonas} zonas${botella.fichas.length > 1 ? ` · ${botella.fichas.length} fichas` : ''}`),
      el('p', { class: 'gramos' }, botella.fichas.map((f) => `${f.ficha_codigo} · ${gramajeDe(f)} g`).join('  ·  ')),
    ]),
  ]);
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
  const texto = state.gramajes.get(ficha.id) || '';
  const pedido = textoACentesimas(texto);
  const nuevo = pedido.ok ? calcularNuevo(preparada, pedido.centesimas) : null;
  const aviso = nuevo && fueraDeLoHabitual(pedido.centesimas, preparada.sumaC);
  const sec = el('article', { class: 'ficha', 'data-ficha': ficha.id, 'data-patron': String(preparada.sumaC) }, [
    el('div', { class: 'ficha-nav no-print' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ir('#/') }, 'Volver'),
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => window.print() }, 'Imprimir / Guardar PDF'),
    ]),
    el('header', { class: 'solo-print print-cab' }, [
      logo('print-logo'),
      el('div', {}, [
        el('strong', {}, 'Calculadora Sopladora'),
        el('span', {}, 'Refresco Iberia · Planta Alcolea · Edición 15 · 24/11/2026'),
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
  datos.append(
    el('h2', {}, 'Gramaje patrón'),
    el('p', { class: 'lead' }, `El objetivo de cada zona es el medio. El gramaje patrón de la ficha es la suma de los medios: ${formatoGramos(preparada.sumaC)} g.`),
    tablaZonas('patrón', preparada.zonas, preparada.pct, preparada),
    el('p', { class: 'suma', 'data-suma-zonas': String(preparada.sumaC) }, `Suma de zonas = ${formatoGramos(preparada.sumaC)} g`),
    calculadora(ficha, texto, preparada),
  );
  const caja = el('div', { id: 'resultado-gramaje' });
  rellenarResultado(caja, ficha, preparada);
  datos.append(caja);
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

function columnaFoto(botella, ficha, preparada, nuevo) {
  const foto = urlImagen(botella);
  const marco = el('div', { class: 'foto-marco' });
  if (foto) marco.append(el('img', { src: foto, alt: botella.nombre, class: 'foto' }));
  const limpia = botella.imagen_sin_zonas_pintadas && botella.zonas_en_foto?.limites_pct;
  if (limpia) marco.append(bandasFoto(botella, ficha, preparada, nuevo));
  const cortes = el('p', { class: 'cortes' }, [
    'Alturas de corte: ',
    ficha.cortes_cm.map((c) => `${String(c).replace('.', ',')} cm`).join(' · ') || 'sin cortes',
  ]);
  const leyenda = el('div', { class: 'leyenda' });
  preparada.zonas.forEach((z, i) => {
    const medio = nuevo ? nuevo.filas[i].medioC : z.medioC;
    leyenda.append(el('div', { class: 'leyenda-fila' }, [
      el('span', { class: `punto zona-${z.clave}` }),
      el('span', {}, z.nombre),
      el('strong', { 'data-peso': String(i) }, `${formatoGramos(medio)} g`),
    ]));
  });
  return el('div', { class: 'col-foto' }, [marco, cortes, barraPesos(preparada, nuevo), leyenda]);
}

function bandasFoto(botella, ficha, preparada, nuevo) {
  const limites = botella.zonas_en_foto.limites_pct;
  const orden = botella.zonas_en_foto.orden || [];
  const capa = el('div', { class: 'zonas-foto', 'aria-hidden': 'true' });
  for (let i = 0; i < limites.length - 1; i += 1) {
    const clave = orden[i];
    const zona = preparada.zonas.find((z) => z.clave === clave);
    const idx = preparada.zonas.indexOf(zona);
    const medio = zona && nuevo ? nuevo.filas[idx].medioC : zona?.medioC;
    const alto = limites[i + 1] - limites[i];
    capa.append(el('div', { class: `banda zona-${clave || 'hombro'}`, style: `height:${alto}%` }, [
      el('span', idx >= 0 ? { 'data-peso': String(idx), 'data-banda': '1' } : {}, zona ? `${zona.nombre} ${formatoGramos(medio)} g` : ''),
    ]));
  }
  const boundaries = limites.slice(1, -1);
  const cortes = [...(ficha.cortes_cm || [])];
  if (boundaries.length === cortes.length) {
    const desc = [...cortes].sort((a, b) => b - a);
    boundaries.forEach((pct, i) => {
      capa.append(el('span', { class: 'marca-corte', style: `top:${pct}%` }, `${String(desc[i]).replace('.', ',')} cm`));
    });
  }
  return capa;
}

function barraPesos(preparada, nuevo) {
  const medios = preparada.zonas.map((z, i) => (nuevo ? nuevo.filas[i].medioC : z.medioC));
  const total = medios.reduce((a, b) => a + b, 0) || 1;
  const barra = el('div', { class: 'barra-apilada', 'aria-hidden': 'true' });
  preparada.zonas.forEach((z, i) => {
    barra.append(el('div', {
      class: `seg zona-${z.clave}`,
      style: `height:${(medios[i] / total) * 100}%`,
      title: z.nombre,
      'data-peso': String(i),
    }));
  });
  return el('div', { class: 'barra-caja' }, [
    el('p', { class: 'hint' }, 'Reparto del gramaje'),
    barra,
  ]);
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
      el('td', { class: 'num objetivo', 'data-medio': String(fila.medioC) }, formatoGramos(fila.medioC)),
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
  const texto = state.gramajes.get(ficha.id) || '';
  const pedido = textoACentesimas(texto);
  const nuevo = pedido.ok ? calcularNuevo(preparada, pedido.centesimas) : null;
  const aviso = nuevo && fueraDeLoHabitual(pedido.centesimas, preparada.sumaC);
  const abierto = caja.querySelector?.('.extremos')?.open;
  caja.replaceChildren();
  if (pedido.ok && nuevo) {
    const bloques = [
      el('h2', {}, `Gramaje nuevo ${formatoGramos(pedido.centesimas)} g`),
      pedido.redondeado ? el('p', { class: 'hint' }, `Se usan ${formatoGramos(pedido.centesimas)} g, redondeados a 2 decimales.`) : null,
      aviso ? el('p', { class: 'aviso-habitual', role: 'status' }, 'Gramaje fuera de lo habitual para esta botella.') : null,
      tablaZonas('nuevo', nuevo.filas, nuevo.pct, nuevo, preparada.zonas),
      el('p', { class: 'suma', 'data-suma-nueva': String(nuevo.sumaC), 'data-n': String(pedido.centesimas) }, `Suma de zonas = ${formatoGramos(nuevo.sumaC)} g`),
      comparativa(preparada, nuevo),
    ].filter(Boolean);
    caja.append(...bloques);
  } else if (texto.trim() && !pedido.ok && pedido.motivo !== 'vacio') {
    caja.append(el('p', { class: 'error', role: 'alert' }, 'Escribe el gramaje en gramos. Vale la coma o el punto: 40,4 o 40.4.'));
  }
  const extremos = recuadroExtremos(preparada, nuevo);
  if (abierto) extremos.open = true;
  caja.append(extremos);
  refrescarFoto(preparada, nuevo);
  const campo = document.getElementById('nuevo-gramaje');
  if (campo) campo.setAttribute('aria-invalid', texto.trim() && !pedido.ok ? 'true' : 'false');
}

function refrescarFoto(preparada, nuevo) {
  document.querySelectorAll('[data-peso]').forEach((nodo) => {
    const i = Number(nodo.dataset.peso);
    const medio = nuevo ? nuevo.filas[i].medioC : preparada.zonas[i].medioC;
    if (nodo.classList.contains('seg')) {
      const total = (nuevo ? nuevo.filas : preparada.zonas).reduce((s, f) => s + (f.medioC), 0) || 1;
      nodo.style.height = `${(medio / total) * 100}%`;
    } else {
      const nombre = preparada.zonas[i]?.nombre;
      nodo.textContent = nodo.dataset.banda ? `${nombre} ${formatoGramos(medio)} g` : `${formatoGramos(medio)} g`;
    }
  });
}

function calculadora(ficha, texto, preparada) {
  return el('form', {
    class: 'calculadora no-print',
    onsubmit: (ev) => ev.preventDefault(),
  }, [
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
          const caja = document.getElementById('resultado-gramaje');
          if (caja) rellenarResultado(caja, ficha, preparada);
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn-ghost',
        onclick: () => {
          state.gramajes.set(ficha.id, '');
          const campo = document.getElementById('nuevo-gramaje');
          if (campo) campo.value = '';
          const caja = document.getElementById('resultado-gramaje');
          if (caja) rellenarResultado(caja, ficha, preparada);
        },
      }, 'Restablecer'),
    ]),
    el('p', { class: 'hint' }, 'Cada zona conserva el mismo margen en gramos que la ficha patrón. La suma de los medios nuevos es exactamente el gramaje escrito.'),
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
    const antes = z.medioC;
    const despues = nuevo.filas[i].medioC;
    const delta = despues - antes;
    lista.append(el('div', { class: 'cmp-zona' }, [
      el('div', { class: 'cmp-nombre' }, [
        el('span', { class: `punto zona-${z.clave}` }),
        el('strong', {}, z.nombre),
        el('span', { class: delta === 0 ? 'delta cero' : 'delta' }, `${formatoGramos(delta, { signo: true })} g`),
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
      el('span', { class: `cmp-relleno ${clase}`, style: `width:${ancho}%` }),
    ]),
    el('span', { class: 'num' }, formatoGramos(valor)),
  ]);
}

function recuadroExtremos(preparada, nuevo) {
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
  return el('details', { class: 'extremos' }, [
    el('summary', {}, [
      el('span', { class: 'aviso-ico', 'aria-hidden': 'true' }, '!'),
      'Valor extremo / excepcional',
    ]),
    el('p', {}, 'Mín-Mín es el mínimo menos 0,20 g y Máx-Máx es el máximo más 0,20 g. Solo para una situación excepcional. No son el objetivo de trabajo.'),
    el('div', { class: 'tabla-scroll' }, [tabla]),
  ]);
}

function vistaMedias() {
  const planas = fichasPlanas(state.doc);
  const grupos = mediasCalculadas(planas);
  const gas = state.gas;
  const cap = state.capacidad;
  let nombre;
  if (gas === 'todas' && cap === 'todas') nombre = 'GENERAL (todas las fichas)';
  else if (gas === 'con_gas' && cap === 'todas') nombre = 'Con gas (todas las capacidades)';
  else if (gas === 'sin_gas' && cap === 'todas') nombre = 'Sin gas (todas las capacidades)';
  else {
    const g = gas === 'con_gas' ? 'Con gas' : gas === 'sin_gas' ? 'Sin gas' : 'Todas';
    nombre = `${g} · ${cap} L`;
  }
  const grupo = grupos.find((g) => g.grupo === nombre);
  const sec = el('section', { class: 'medias', 'data-grupo': nombre }, [
    el('h1', {}, 'Medias de porcentaje por zona'),
    el('p', { class: 'lead' }, 'Porcentaje de cada zona sobre la suma de los medios de su ficha. Sirve de referencia del grupo, no sustituye a la ficha.'),
    filtros(),
  ]);
  if (!grupo) {
    sec.append(el('p', { class: 'vacio' }, 'No hay fichas en este grupo.'));
    return sec;
  }
  const tabla = el('table', { class: 'tabla' });
  tabla.append(el('caption', {}, `${nombre} · ${grupo.n_fichas} ${grupo.n_fichas === 1 ? 'ficha' : 'fichas'}`));
  tabla.append(el('thead', {}, [el('tr', {}, ['Zona', 'Media %', 'Fichas con la zona'].map((t) => el('th', { scope: 'col' }, t)))]));
  const cuerpo = el('tbody');
  for (const clave of ORDEN_ZONA) {
    const z = grupo.zonas[clave];
    if (!z) continue;
    const unidades = Math.round(z.media * 100);
    cuerpo.append(el('tr', { 'data-media': clave }, [
      el('th', { scope: 'row' }, [
        el('span', { class: `punto zona-${clave}` }),
        ` ${nombreZonaVisible(clave)}`,
      ]),
      el('td', { class: 'num', 'data-media-pct': String(unidades) }, formatoPct(unidades)),
      el('td', { class: 'num' }, String(z.n)),
    ]));
  }
  tabla.append(cuerpo);
  sec.append(
    el('div', { class: 'tabla-scroll' }, [tabla]),
    el('p', { class: 'hint' }, 'Si el grupo mezcla fichas con distinto número de zonas, las medias de cada zona no suman 100 %.'),
    bloqueZonas(grupos),
  );
  return sec;
}

function bloqueZonas(grupos) {
  const det = el('details', { class: 'por-zonas no-print' });
  det.append(el('summary', {}, 'Por número de zonas'));
  const lista = el('div', { class: 'por-zonas-grid' });
  for (const g of grupos.filter((x) => x.grupo.startsWith('Por nº de zonas'))) {
    lista.append(el('article', { class: 'mini-grupo' }, [
      el('h3', {}, `${g.grupo} · ${g.n_fichas}`),
      el('ul', {}, ORDEN_ZONA.filter((c) => g.zonas[c]).map((c) => el('li', {}, `${nombreZonaVisible(c)} ${formatoPct(Math.round(g.zonas[c].media * 100))} %`))),
    ]));
  }
  det.append(lista);
  return det;
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

function arrancar() {
  registrarSW();
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
