import {
  esc, icono, etiquetaGrupo, esCodigoG, tieneDatos, parseNum, enteroPlano, boolTexto,
  CABECERA, ENVASE, PALET_CAMPOS, TABLAS, DISENO_GRUPOS, TIPO_INC, fechaPaquete,
} from './util.js';
import { rangoIncoherente } from './analisis.js';

function seccion(titulo, ico, cuerpo, { open = false, extra = '', cuenta = '' } = {}) {
  return `<details class="sec"${open ? ' open' : ''}>
    <summary>
      <span class="sec-ico">${icono(ico)}</span>
      <span class="sec-t">${esc(titulo)}</span>
      ${cuenta ? `<span class="sec-n">${esc(cuenta)}</span>` : ''}
      <span class="chev">${icono('chevron')}</span>
    </summary>
    <div class="sec-b">${extra}${cuerpo}</div>
  </details>`;
}

function htmlKv(pares, vacios) {
  const filas = [];
  for (const [etiqueta, valor] of pares) {
    const vacio = valor == null || valor === '';
    if (vacio && !vacios) continue;
    filas.push(`<div><dt>${esc(etiqueta)}</dt><dd>${vacio ? '<span class="na">Vacío en el PDF</span>' : esc(valor)}</dd></div>`);
  }
  if (!filas.length) return '<p class="vacio">Sin datos en esta sección.</p>';
  return `<dl class="kv">${filas.join('')}</dl>`;
}

function incsDe(incs, path) {
  return (incs || []).filter((i) => i.campo === path || String(i.campo || '').startsWith(`${path}.`));
}

function notasInc(avisos) {
  return avisos.map((i) => `<p class="inc-line"><strong>${esc(TIPO_INC[i.tipo] || i.tipo)}.</strong> ${esc(i.detalle)}</p>`).join('');
}

function barra(fila) {
  const min = parseNum(fila.min);
  const max = parseNum(fila.max);
  const std = parseNum(fila.std);
  if (min == null || max == null || !(max > min)) return '';
  let pct = null;
  let fuera = false;
  if (std != null) {
    pct = ((std - min) / (max - min)) * 100;
    if (pct < 0 || pct > 100) fuera = true;
    pct = Math.min(100, Math.max(0, pct));
  }
  return `<div class="track${fuera ? ' is-out' : ''}" aria-hidden="true"><div class="track-fill"></div>${
    pct == null ? '' : `<span class="mark" style="left:${pct.toFixed(2)}%"></span>`
  }</div>${fuera ? '<p class="inc-line">El estándar cae fuera del máximo y el mínimo. Se muestra el valor del PDF, sin ajustarlo.</p>' : ''}`;
}

function ariaFila(fila) {
  const partes = [fila.etiqueta || ''];
  if (fila.min != null) partes.push(`mínimo ${fila.min}`);
  if (fila.std != null) partes.push(`estándar ${fila.std}`);
  if (fila.max != null) partes.push(`máximo ${fila.max}`);
  if (fila.valor != null) partes.push(String(fila.valor));
  if (fila.casilla_1 != null) partes.push(`casilla 1 ${fila.casilla_1}`);
  if (fila.casilla_2 != null) partes.push(`casilla 2 ${fila.casilla_2}`);
  if (fila.unidad) partes.push(fila.unidad);
  return partes.filter(Boolean).join(', ');
}

function htmlMedida(fila, path, avisos) {
  const id = `med-${path.replace(/[^a-z0-9]+/gi, '-')}`;
  const incoherente = rangoIncoherente(fila, avisos);
  const dato = (nombre, valor) => (valor == null || valor === '' ? '' : ` data-${nombre}="${esc(valor)}"`);
  return `<div class="medida">
    <label for="${id}">Valor medido</label>
    <input id="${id}" class="medida-in" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done"${dato('std', fila.std)}${dato('min', fila.min)}${dato('max', fila.max)} data-etiqueta="${esc(fila.etiqueta || '')}" data-incoherente="${incoherente ? '1' : '0'}">
    <p class="medida-juicio" aria-live="polite"></p>
  </div>`;
}

function renderFila(fila, path, incs, vacios, medible = false) {
  const avisos = incsDe(incs, path);
  const datos = tieneDatos(fila);
  if (!datos && !vacios) return '';
  if (!datos) {
    return `<div class="gauge is-empty"><span class="gauge-name">${esc(fila?.etiqueta || path)}</span><span class="na">Vacío en el PDF</span></div>`;
  }
  const warn = avisos.length ? ' is-warn' : '';
  const notas = notasInc(avisos);
  if (fila.casilla_1 != null || fila.casilla_2 != null) {
    return `<div class="gauge${warn}">
      <div class="gauge-h"><span class="gauge-name">${esc(fila.etiqueta)}</span></div>
      <div class="casillas" aria-label="${esc(ariaFila(fila))}">
        ${fila.casilla_1 != null ? `<span><i>Casilla 1</i><b>${esc(fila.casilla_1)}</b></span>` : ''}
        ${fila.casilla_2 != null ? `<span><i>Casilla 2</i><b>${esc(fila.casilla_2)}</b></span>` : ''}
      </div>
      ${notas}
    </div>`;
  }
  if (fila.valor != null && fila.std == null && fila.max == null && fila.min == null) {
    return `<div class="valor-row${warn}">
      <span class="gauge-name">${esc(fila.etiqueta)}</span>
      <strong>${esc(fila.valor)}</strong>
      ${fila.unidad ? `<em>${esc(fila.unidad)}</em>` : ''}
      ${notas}
    </div>`;
  }
  const nums = [
    fila.min != null ? `<span><i>Mín.</i><b>${esc(fila.min)}</b></span>` : '',
    fila.std != null ? `<span class="is-std"><i>Std.</i><b>${esc(fila.std)}</b></span>` : '',
    fila.max != null ? `<span><i>Máx.</i><b>${esc(fila.max)}</b></span>` : '',
  ].join('');
  const minN = parseNum(fila.min);
  const maxN = parseNum(fila.max);
  const invertido = minN != null && maxN != null && maxN < minN;
  return `<div class="gauge${warn}">
    <div class="gauge-h">
      <span class="gauge-name">${esc(fila.etiqueta)}</span>
      ${fila.unidad ? `<span class="gauge-unit">${esc(fila.unidad)}</span>` : ''}
    </div>
    <div class="gauge-nums" aria-label="${esc(ariaFila(fila))}">${nums}</div>
    ${fila.valor != null ? `<p class="valor-extra">${esc(fila.valor)}</p>` : ''}
    ${invertido ? '<p class="inc-line">En el PDF el máximo es menor que el mínimo. No se ha reordenado.</p>' : barra(fila)}
    ${notas}
    ${medible ? htmlMedida(fila, path, avisos) : ''}
  </div>`;
}

function htmlTabla(p, tabla, vacios) {
  const obj = p[tabla.id] || {};
  const medible = tabla.id === 'datos_jarabe' || tabla.id === 'producto_terminado' || tabla.id === 'proceso';
  const filas = Object.entries(obj)
    .map(([k, fila]) => renderFila(fila, `${tabla.id}.${k}`, p.incidencias, vacios, medible))
    .filter(Boolean);
  const n = Object.values(obj).filter(tieneDatos).length;
  const nota = tabla.nota ? `<p class="nota">${esc(tabla.nota)}</p>` : '';
  return seccion(tabla.titulo, tabla.icono, `<div class="gauges">${filas.join('') || '<p class="vacio">Sin valores en esta ficha.</p>'}</div>`, {
    open: n > 0,
    extra: nota,
    cuenta: n ? String(n) : '',
  });
}

export function htmlTarjeta(p) {
  const inc = p.incidencias?.length || 0;
  const casilla = p.imagenes_sha256?.etiqueta ? 'etiqueta' : (p.imagenes_disponibles?.[0] || '');
  return `<article class="pcard">
    <a href="?sap=${encodeURIComponent(p.codigo_sap)}">
      <div class="thumb" data-sap="${esc(p.codigo_sap)}"${casilla ? ` data-casilla="${esc(casilla)}"` : ''} aria-hidden="true"></div>
      <div class="pcard-b">
        <div class="badges">
          <span class="badge">SAP ${esc(p.codigo_sap)}</span>
          ${p.sap_mezcla ? `<span class="badge badge-g">${esc(p.sap_mezcla)}</span>` : ''}
          ${inc ? `<span class="badge badge-w">${icono('warning')} ${inc}</span>` : ''}
        </div>
        <h3>${esc(p.producto)}</h3>
        <p>${esc(p.marca || 'Sin marca')} · ${esc(p.formato || '')}</p>
        <p class="sub">${esc(etiquetaGrupo(p.grupo_pdf))} · ${esc(p.familia_derivada || '')}</p>
      </div>
    </a>
  </article>`;
}

function chip(k, valor, etiqueta, activo, cuenta) {
  return `<button type="button" class="chip${activo ? ' is-on' : ''}" data-act="filtro" data-k="${esc(k)}" data-v="${esc(valor)}" aria-pressed="${activo ? 'true' : 'false'}">${esc(etiqueta)}${cuenta != null ? `<span>${cuenta}</span>` : ''}</button>`;
}

function filaChips(titulo, clave, opciones, actual) {
  const chips = [chip(clave, '', 'Todas', !actual, null)].concat(
    opciones.map((item) => {
      const valor = Array.isArray(item) ? item[0] : item.clave;
      const n = Array.isArray(item) ? item[1] : item.total;
      const etiqueta = Array.isArray(item) ? (item[2] || item[0]) : item.etiqueta;
      return chip(clave, valor, etiqueta, actual === valor, n);
    }),
  );
  return `<div class="chip-row"><span class="chip-label" id="lab-${esc(clave)}">${esc(titulo)}</span><div class="chip-scroller" role="group" aria-labelledby="lab-${esc(clave)}">${chips.join('')}</div></div>`;
}

const MARCA = 'img/marca2026/';
const TAGLINE = 'The agile beverage solutions partner.';

function burbujasLogin(n) {
  let html = '';
  for (let i = 0; i < n; i += 1) {
    // Distribución fija (sin Math.random) para que el render sea estable.
    const left = (i * 37 + 11) % 100;
    const size = 8 + ((i * 13) % 26);
    const delay = (i * 1.7) % 9;
    const dur = 7 + ((i * 3) % 7);
    html += `<span class="bubble" style="left:${left}%;width:${size}px;height:${size}px;animation-delay:-${delay.toFixed(1)}s;animation-duration:${dur}s"></span>`;
  }
  return `<div class="bubbles" aria-hidden="true">${html}</div>`;
}

/** Fondo del acceso (imagen Refresco 2026, igual que Inspecciones Calidad v1.5.0). */
function decoracionLogin() {
  const botellas = [1, 2, 3, 4]
    .map((n, i) => `<div class="gate-bottle" style="--i:${i}"><img src="${MARCA}foto-linea-${n}.webp" alt=""></div>`)
    .join('');
  return `<div class="gate-decor" aria-hidden="true">
      <div class="gate-photo"><img src="${MARCA}foto-burbujas.webp" alt=""></div>
      <img class="gate-circles" src="${MARCA}circulos-azul.svg" alt="">
      <img class="gate-stripe" src="${MARCA}stripe-r-naranja.svg" alt="">
      <div class="gate-bottles">${botellas}</div>
      ${burbujasLogin(18)}
    </div>`;
}

export function htmlLogin({ error = '', ocupado = false, fecha = '', destino = '' }) {
  return `<div class="login">
    ${decoracionLogin()}
    <main class="login-card" id="contenido">
      <img class="login-logo" src="${MARCA}refresco-logo-naranja.png" alt="Refresco">
      <h1>Fichas de producto terminado</h1>
      <p class="login-sub">Refresco Iberia · Planta Alcolea</p>
      ${fecha ? `<p class="fecha-datos">Datos del ${esc(fecha)}</p>` : ''}
      ${destino ? `<p class="fecha-datos">Al entrar se abrirá la ficha SAP ${esc(destino)}.</p>` : ''}
      <form id="login-form">
        <label for="clave">Contraseña</label>
        <input id="clave" name="clave" type="password" autocomplete="current-password" placeholder="••••••••" required ${ocupado ? 'disabled' : ''} autofocus>
        <label class="check"><input type="checkbox" name="recordar" ${ocupado ? 'disabled' : ''}> Recordar en este dispositivo</label>
        <button class="btn btn-primary" type="submit" ${ocupado ? 'disabled aria-busy="true"' : ''}>${ocupado ? 'Abriendo las fichas…' : 'Entrar'}</button>
        <p class="error" role="alert">${esc(error)}</p>
        ${ocupado ? '<p class="hint">En un móvil puede tardar unos segundos.</p>' : ''}
      </form>
      <p class="hint">Los datos se descifran en este dispositivo. La contraseña no se almacena.</p>
      <p class="tagline">${TAGLINE}</p>
    </main>
  </div>`;
}

export function htmlShell({ fecha }) {
  return `<div class="shell">
    <a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="topbar">
      <div class="topbar-row">
        <img class="topbar-stripe" src="img/marca2026/stripe-r-naranja.svg" alt="" aria-hidden="true">
        <a class="brand" href="./" data-go="inicio">
          <img class="brand-logo" src="img/marca2026/refresco-logo-naranja.png" alt="Refresco">
          <span class="brand-sub">Fichas · Alcolea</span>
        </a>
        <div class="top-actions">
          <button type="button" id="btn-planta" class="btn btn-ghost" data-act="planta" aria-pressed="false" aria-label="Modo planta">${icono('spark')} <span>Planta</span></button>
          <button type="button" id="btn-instalar" class="btn btn-ghost" hidden data-act="instalar">${icono('install')} Instalar</button>
          <button type="button" id="btn-actualizar" class="btn btn-ghost" hidden data-act="actualizar">Actualizar</button>
          <button type="button" class="btn btn-ghost" data-act="salir" aria-label="Salir">${icono('logout')} <span>Salir</span></button>
        </div>
      </div>
      <form class="buscador" id="form-buscar" role="search">
        <label class="sr" for="q">Buscar por SAP, código G, denominación, marca o EAN</label>
        <span class="buscador-ico" aria-hidden="true">${icono('search')}</span>
        <input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="SAP, código G, denominación, marca o EAN" aria-describedby="atajo-q">
        <button type="button" class="btn-icon btn-scan" data-act="escanear" aria-label="Escanear código de barras">${icono('camera')}</button>
        <button type="button" class="btn-icon" data-act="limpiar-q" aria-label="Borrar búsqueda">${icono('close')}</button>
      </form>
      <p id="atajo-q" class="sr">Atajo de teclado: barra /</p>
      <nav class="tabbar" aria-label="Secciones">
        <a data-go="inicio" href="./">${icono('home')}<span>Inicio</span></a>
        <a data-go="buscar" href="?vista=buscar">${icono('search')}<span>Buscar</span></a>
        <a data-go="novedades" href="?vista=novedades">${icono('spark')}<span>Novedades</span></a>
        <a data-go="codigos" href="?vista=codigos-g">${icono('layers')}<span>Códigos</span></a>
        <a data-go="comparar" href="?vista=comparar">${icono('compare')}<span>Comparar</span></a>
      </nav>
    </header>
    <div id="aviso-red" class="banner-red" hidden>Sin conexión. Estás viendo las fichas guardadas en este dispositivo.</div>
    <main id="contenido" tabindex="-1"></main>
    <div id="dock" class="dock" hidden></div>
    <footer class="pie">
      <img class="pie-r" src="img/marca2026/refresco-r-naranja.png" alt="" aria-hidden="true">
      <p><strong>Refresco Iberia</strong> · Planta Alcolea</p>
      <p>Fichas de producto terminado · Coordinación de Calidad</p>
      <p>Jorge Quezada Ortega · Coordinador de Calidad</p>
      <p>Datos del ${esc(fecha)}. Los valores se muestran tal cual en el PDF de origen.</p>
      <p><a class="enlace-discreto" href="?vista=actualizar" data-go="actualizar">Actualizar fichas</a></p>
      <p class="pie-tagline">The agile beverage solutions partner.</p>
    </footer>
  </div>`;
}

function notaCodigosG(stats) {
  const otros = (stats.noG || [])
    .map((item) => `${item.codigo} (${item.n} ${item.n === 1 ? 'ficha' : 'fichas'})`)
    .join(', ');
  const combinado = (stats.noG || []).some((item) => String(item.codigo).includes('/'));
  return `${stats.codigosG} códigos G: SAP Mezcla con forma G y dígitos, de ${stats.mezclas} valores distintos. No cuentan como código G: ${otros}.${combinado ? ' El valor con barra se conserva entero y no se divide en dos códigos.' : ''} ${stats.compartidosG} de esos ${stats.codigosG} los comparten varias fichas (${stats.compartidosMezcla} si se cuentan los ${stats.mezclas} valores de mezcla).`;
}

function listaCodigosGuardados(productosLista, vacio) {
  if (!productosLista.length) return `<p class="vacio">${vacio}</p>`;
  return `<ul class="recientes">${productosLista.map((p) => `<li><a href="?sap=${encodeURIComponent(p.codigo_sap)}"><span class="badge">SAP ${esc(p.codigo_sap)}</span><strong>${esc(p.producto)}</strong></a></li>`).join('')}</ul>`;
}

export function htmlInicio({ fechaHumana, bruto, stats, formatos, familias, marcas, recientes, favoritos = [], abiertas = [], fuentes }) {
  const maxF = Math.max(...formatos.map(([, n]) => n), 1);
  const maxFam = Math.max(...familias.map(([, n]) => n), 1);
  const barras = (items, max, clave) => items.map(([valor, n]) => `
    <button type="button" class="bar-row" data-act="filtro" data-k="${esc(clave)}" data-v="${esc(valor)}">
      <span class="bar-label">${esc(valor)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (n / max) * 100).toFixed(1)}%"></span></span>
      <span class="bar-n">${n}</span>
    </button>`).join('');
  return `<section class="hero-home">
      <p class="kicker">Refresco Iberia · Planta Alcolea</p>
      <h1>Fichas de producto terminado</h1>
      <p>Busca por código SAP o código G, o recorre formato, familia y marca. Nada se redondea: si el PDF trae una incoherencia, se avisa y se deja el valor.</p>
      <p class="fecha-datos">Datos del <strong>${esc(fechaHumana)}</strong> <span class="bruto">${esc(bruto)}</span></p>
      <div class="hero-cinta" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<img src="img/marca2026/foto-linea-${n}.webp" alt="" loading="lazy">`).join('')}</div>
    </section>
    <div class="stats">
      <button type="button" class="stat" data-go="buscar"><b>${stats.n}</b><span>Fichas</span></button>
      <button type="button" class="stat" data-act="filtro" data-k="grupo" data-v="asepticos"><b>${stats.asepticos}</b><span>Asépticos</span></button>
      <button type="button" class="stat" data-act="filtro" data-k="grupo" data-v="carbonatados"><b>${stats.carbonatados}</b><span>Carbonatados</span></button>
      <button type="button" class="stat" data-go="codigos"><b>${stats.codigosG}</b><span>Códigos G</span></button>
      <button type="button" class="stat" data-act="filtro" data-k="inc" data-v="1"><b>${stats.incidencias}</b><span>Incidencias</span></button>
      <div class="stat stat-quiet"><b>${stats.imagenes}</b><span>Imágenes</span></div>
    </div>
    <p class="nota centro">${notaCodigosG(stats)} ${stats.fichasInc} fichas traen avisos del PDF de origen.</p>
    <div class="paneles">
      <section class="panel">
        <h2>Por formato</h2>
        <div class="bars">${barras(formatos, maxF, 'formato')}</div>
      </section>
      <section class="panel">
        <h2>Por familia</h2>
        <div class="bars">${barras(familias, maxFam, 'familia')}</div>
      </section>
    </div>
    <section class="panel">
      <h2>Por marca</h2>
      <div class="marca-grid">${marcas.map((m) => `<button type="button" class="marca" data-act="filtro" data-k="marca" data-v="${esc(m.clave)}">${esc(m.etiqueta)} <b>${m.total}</b></button>`).join('')}</div>
    </section>
    <section class="panel">
      <div class="panel-h"><h2>Favoritas</h2><button type="button" class="btn btn-ghost" data-act="limpiar-fav">Vaciar</button></div>
      ${listaCodigosGuardados(favoritos, 'Todavía no hay favoritas. La estrella de una ficha la guarda en este dispositivo.')}
    </section>
    <section class="panel">
      <div class="panel-h"><h2>Abiertas recientemente</h2><button type="button" class="btn btn-ghost" data-act="limpiar-recientes">Vaciar</button></div>
      ${listaCodigosGuardados(abiertas, 'Las últimas fichas que abras aparecerán aquí.')}
    </section>
    <section class="panel">
      <h2>Fichas con fecha más reciente</h2>
      <p class="nota">La fecha es la que imprime la ficha, sin reinterpretar el día.</p>
      <ul class="recientes">${recientes.map((p) => `<li><a href="?sap=${encodeURIComponent(p.codigo_sap)}"><span class="badge">${esc(p.fecha)}</span><span class="badge">Ed. ${esc(p.edicion)}</span><strong>${esc(p.codigo_sap)}</strong> ${esc(p.producto)}</a></li>`).join('')}</ul>
    </section>
    <section class="panel">
      <h2>Origen del paquete</h2>
      <ul class="fuentes">${(fuentes || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    </section>`;
}

export function htmlBuscar(ctx) {
  const { filtros, formatos, familias, marcas, nInc } = ctx;
  return `<section class="buscar">
    <h1>Búsqueda</h1>
    <div class="filtros">
      <div class="chip-row">
        <span class="chip-label" id="lab-grupo">Grupo</span>
        <div class="chip-scroller" role="group" aria-labelledby="lab-grupo">
          ${chip('grupo', '', 'Todos', !filtros.grupo)}
          ${chip('grupo', 'asepticos', 'Asépticos', filtros.grupo === 'asepticos')}
          ${chip('grupo', 'carbonatados', 'Carbonatados', filtros.grupo === 'carbonatados')}
          <button type="button" class="chip${filtros.inc ? ' is-on' : ''}" data-act="filtro" data-k="inc" data-v="1" aria-pressed="${filtros.inc ? 'true' : 'false'}">${icono('warning')} Con incidencias <span>${nInc}</span></button>
        </div>
      </div>
      ${filaChips('Formato', 'formato', formatos, filtros.formato)}
      ${filaChips('Familia', 'familia', familias, filtros.familia)}
      ${filaChips('Marca', 'marca', marcas, filtros.marca)}
    </div>
    <div id="resultados">${htmlResultados(ctx)}</div>
  </section>`;
}

export function htmlResultados({ resultados, total, limite, avisoMezcla, q }) {
  const visibles = resultados.slice(0, limite);
  const aviso = avisoMezcla ? `<a class="aviso-g" href="?g=${encodeURIComponent(avisoMezcla.codigo)}">${icono('layers')} <span><strong>${esc(avisoMezcla.codigo)}</strong> · ${avisoMezcla.n} ficha${avisoMezcla.n === 1 ? '' : 's'}. Ver el jarabe y todos los SAP.</span></a>` : '';
  const vacio = total === 0
    ? `<div class="vacio-grande"><h2>Ninguna ficha coincide</h2><p>Prueba con el código SAP, el código G, la marca, el EAN o parte de la denominación. Las tildes no importan.</p></div>`
    : '';
  const mas = visibles.length < total
    ? `<button type="button" class="btn btn-secondary" data-act="mas">Mostrar más (${total - visibles.length} restantes)</button>`
    : '';
  const intro = q
    ? ''
    : '<p class="nota">Sin texto de búsqueda: estás viendo el catálogo con los filtros activos.</p>';
  return `${aviso}${intro}<p class="cuenta" aria-live="polite">${total} ficha${total === 1 ? '' : 's'}</p>${vacio}<div class="cards">${visibles.map(htmlTarjeta).join('')}</div>${mas}`;
}

function htmlPalet(p) {
  const campos = new Set(['uds_palet', 'cajas_palet', 'uds_caja', 'n_capas', 'tipo_palet', 'agrupacion']);
  const avisos = (p.incidencias || []).filter((i) => campos.has(i.campo));
  const capas = enteroPlano(p.n_capas);
  const cajas = enteroPlano(p.cajas_palet);
  let figura = '';
  if (capas && capas > 0 && capas <= 14) {
    const por = cajas && cajas % capas === 0 ? cajas / capas : null;
    const dibujar = por ? Math.min(por, 8) : 1;
    const capasHtml = [];
    for (let i = capas; i >= 1; i -= 1) {
      const cajasHtml = Array.from({ length: dibujar }, () => '<i></i>').join('');
      const extra = por && por > dibujar ? `<b>× ${por}</b>` : '';
      capasHtml.push(`<div class="palet-capa"><span>Capa ${i}</span><span class="cajas">${cajasHtml}${extra}</span></div>`);
    }
    figura = `<div class="palet" aria-hidden="true">${capasHtml.join('')}<div class="palet-base">Base de palet</div></div><p class="nota">Esquema orientativo, no a escala. Valen los números de la tabla, copiados de la ficha.</p>`;
  }
  const cuerpo = `${notasInc(avisos)}<div class="palet-lay">${figura}${htmlKv(PALET_CAMPOS.map(([k, lab]) => [lab, p[k]]), false)}</div>`;
  return seccion('Palet', 'pallet', cuerpo, { open: true });
}

function htmlDiseno(p, vacios) {
  const d = p.diseno || {};
  const bloques = [];
  for (const g of DISENO_GRUPOS) {
    const pares = g.campos.map(([k, lab]) => [lab, d[k]]);
    const alguno = pares.some(([, v]) => v != null && v !== '');
    if (!alguno && !vacios) continue;
    bloques.push(`<h3 class="subh">${esc(g.titulo)}</h3>${htmlKv(pares, vacios)}`);
  }
  if (!bloques.length) return '';
  return seccion('Diseños y materiales auxiliares', 'image', bloques.join(''), { open: true });
}

function htmlGaleria(galeria) {
  if (!galeria.length) {
    return seccion('Imágenes de la página 2', 'image', '<p class="vacio">Esta ficha no trae dibujos.</p>', { open: true });
  }
  const grid = `<div class="galeria">${galeria.map((g, i) => `
    <button type="button" class="gal-item" data-act="lb" data-i="${i}">
      <img src="${esc(g.url)}" alt="${esc(g.alt)}" width="${Number(g.ancho) || ''}" height="${Number(g.alto) || ''}" data-hash="${esc(g.hash || '')}">
      <span>${esc(g.alt)}</span>
    </button>`).join('')}</div>`;
  return seccion('Imágenes de la página 2', 'image', `<p class="nota">Dibujos recortados de la página 2. Pulsa para ampliar.</p>${grid}`, {
    open: true,
    cuenta: String(galeria.length),
  });
}

function htmlHermanos(p, hermanos) {
  const otros = (hermanos || []).filter((h) => h.codigo_sap !== p.codigo_sap);
  if (!p.sap_mezcla) return '';
  if (!otros.length) {
    return seccion('Productos con el mismo código de mezcla', 'layers', `<p class="vacio">Ninguna otra ficha usa ${esc(p.sap_mezcla)}.</p>`, { open: false });
  }
  const lista = `<p class="nota">${esc(p.sap_mezcla)} está en ${otros.length + 1} fichas.</p><div class="mini-list">${
    otros.map((h) => `<a href="?sap=${encodeURIComponent(h.codigo_sap)}"><strong>${esc(h.codigo_sap)}</strong> ${esc(h.producto)} <em>${esc(h.formato || '')}</em></a>`).join('')
  }</div>`;
  return seccion('Productos con el mismo código de mezcla', 'layers', lista, { open: true, cuenta: String(otros.length) });
}

function filasImpresion(tabla) {
  return Object.values(tabla || {}).filter(tieneDatos).map((fila) => {
    const partes = [];
    if (fila.std != null) partes.push(`Std ${fila.std}`);
    if (fila.min != null) partes.push(`Mín ${fila.min}`);
    if (fila.max != null) partes.push(`Máx ${fila.max}`);
    if (fila.valor != null) partes.push(String(fila.valor));
    if (fila.unidad) partes.push(String(fila.unidad));
    return `<tr><th>${esc(fila.etiqueta || '')}</th><td>${esc(partes.join(' · '))}</td></tr>`;
  }).join('');
}

function htmlImpresion(p, galeria) {
  const etiqueta = (galeria || []).find((g) => g.casilla === 'etiqueta') || (galeria || [])[0];
  return `<section class="solo-impresion">
    <header class="imp-cab">
      <p class="wordmark sm">refresc<span>o</span></p>
      <p>Ficha de producto terminado · Planta Alcolea</p>
    </header>
    <h1>SAP ${esc(p.codigo_sap)} · ${esc(p.sap_mezcla || '')}</h1>
    <p class="imp-nombre">${esc(p.producto)}</p>
    <p>${esc(p.marca || '')} · ${esc(p.formato || '')} · ${esc(etiquetaGrupo(p.grupo_pdf))} · ${esc(p.familia_derivada || '')}</p>
    <p>Fecha ${esc(p.fecha)} · Edición ${esc(p.edicion)} · Consumo preferente ${esc(p.consumo_preferente)} · Relación jarabe ${esc(p.relacion_jarabe || '—')}</p>
    <div class="imp-grid">
      <table><caption>Jarabe</caption><tbody>${filasImpresion(p.datos_jarabe) || '<tr><td>Sin valores</td></tr>'}</tbody></table>
      <table><caption>Producto terminado</caption><tbody>${filasImpresion(p.producto_terminado) || '<tr><td>Sin valores</td></tr>'}</tbody></table>
      <table><caption>Proceso</caption><tbody>${filasImpresion(p.proceso) || '<tr><td>Sin valores</td></tr>'}</tbody></table>
      <table><caption>Palet</caption><tbody>
        <tr><th>Tipo</th><td>${esc(p.tipo_palet || '')}</td></tr>
        <tr><th>Capas</th><td>${esc(p.n_capas || '')}</td></tr>
        <tr><th>Cajas/palet</th><td>${esc(p.cajas_palet || '')}</td></tr>
        <tr><th>Uds/caja</th><td>${esc(p.uds_caja || '')}</td></tr>
        <tr><th>Uds/palet</th><td>${esc(p.uds_palet || '')}</td></tr>
      </tbody></table>
    </div>
    ${p.observaciones ? `<p class="imp-obs"><strong>Observaciones.</strong> ${esc(p.observaciones)}</p>` : ''}
    ${etiqueta ? `<figure class="imp-fig"><img src="${esc(etiqueta.url)}" alt="${esc(etiqueta.alt)}" data-hash="${esc(etiqueta.hash || '')}"><figcaption>${esc(etiqueta.alt)}</figcaption></figure>` : ''}
    <p class="imp-pie">Valores tal cual en el PDF. Documento para consulta interna.</p>
  </section>`;
}

export function htmlProducto({ p, hermanos, galeria, vacios, enComparar, favorito = false, modificada = false }) {
  const incs = p.incidencias || [];
  const banner = incs.length ? `<aside class="banner-inc" role="status">
      <div class="banner-ico">${icono('warning')}</div>
      <div>
        <strong>Incidencias del PDF de origen</strong>
        <p>Están en la ficha original. No se han corregido ni ocultado.</p>
        <ul>${incs.map((i) => `<li><b>${esc(TIPO_INC[i.tipo] || i.tipo)}</b> · ${esc(i.campo)} · ${esc(i.detalle)}</li>`).join('')}</ul>
      </div>
    </aside>` : '';
  const gEs = esCodigoG(p.sap_mezcla);
  const cabeceraPares = [
    ...CABECERA.map(([k, lab]) => [lab, p[k]]),
    ['Aséptico', boolTexto(p.aseptico)],
    ['Marcado E', boolTexto(p.marcado_e)],
  ];
  const paginas = (p.fuente?.paginas || []).join(', ');
  return `<article class="ficha" data-sap="${esc(p.codigo_sap)}">
    ${htmlImpresion(p, galeria)}
    <div class="pantalla">
    <div class="print-head"><span class="wordmark sm">refresc<span>o</span></span><span>Ficha de producto terminado · Planta Alcolea</span><span>SAP ${esc(p.codigo_sap)}</span></div>
    ${banner}
    <header class="hero-prod">
      <div class="hero-codes">
        <button type="button" class="code-btn" data-act="copiar" data-copy="${esc(p.codigo_sap)}" aria-label="Copiar código SAP ${esc(p.codigo_sap)}">
          <span>SAP</span><strong>${esc(p.codigo_sap)}</strong>${icono('copy')}
        </button>
        ${p.sap_mezcla ? `<a class="code-btn code-g" href="?g=${encodeURIComponent(p.sap_mezcla)}"><span>${gEs ? 'Código G' : 'Mezcla'}</span><strong>${esc(p.sap_mezcla)}</strong></a>
          <button type="button" class="code-btn code-copy" data-act="copiar" data-copy="${esc(p.sap_mezcla)}" aria-label="Copiar ${esc(p.sap_mezcla)}">${icono('copy')}</button>` : ''}
      </div>
      <h1>${esc(p.producto)}</h1>
      <div class="badges light">
        <span class="badge">${esc(etiquetaGrupo(p.grupo_pdf))}</span>
        <span class="badge">${esc(p.familia_derivada || '')}</span>
        <span class="badge">${esc(p.formato || '')}</span>
        <span class="badge">${esc(p.marca || '')}</span>
        <span class="badge">${p.con_gas_derivado ? 'Con gas' : 'Sin gas'}</span>
        ${p.aseptico ? '<span class="badge">Aséptico</span>' : ''}
        ${modificada ? '<span class="badge badge-nueva">Modificada en esta versión</span>' : ''}
      </div>
      <p class="hero-meta">Fecha ${esc(p.fecha)} · Edición ${esc(p.edicion)} · Consumo preferente ${esc(p.consumo_preferente)}</p>
      <div class="acciones no-print">
        <button type="button" class="btn btn-star${favorito ? ' is-on' : ''}" data-act="fav" data-sap="${esc(p.codigo_sap)}" aria-pressed="${favorito ? 'true' : 'false'}" aria-label="${favorito ? 'Quitar de favoritas' : 'Guardar como favorita'}">${icono('star')} ${favorito ? 'En favoritas' : 'Favorita'}</button>
        <button type="button" class="btn btn-primary" data-act="imprimir">${icono('print')} Imprimir / PDF</button>
        <button type="button" class="btn btn-secondary" data-act="compartir" data-sap="${esc(p.codigo_sap)}">${icono('share')} Compartir</button>
        <button type="button" class="btn btn-secondary" data-act="comparar-toggle" data-sap="${esc(p.codigo_sap)}">${enComparar ? 'Quitar de comparar' : 'Comparar'}</button>
        <button type="button" class="btn btn-ghost light" data-act="copiar-analisis">Copiar análisis</button>
        <button type="button" class="btn btn-ghost light" data-act="vacios" aria-pressed="${vacios ? 'true' : 'false'}">${vacios ? 'Ocultar vacíos' : 'Mostrar vacíos'}</button>
      </div>
    </header>
    ${seccion('Cabecera', 'info', `${htmlKv(cabeceraPares, vacios)}<p class="nota">Consumo preferente: el PDF no indica la unidad. Por los valores, lo habitual es que sean días. El número de arriba no se ha modificado.</p>`, { open: true })}
    ${seccion('Envase y embalaje', 'bottle', htmlKv(ENVASE.map(([k, lab]) => [lab, p[k]]), vacios), { open: true })}
    ${htmlPalet(p)}
    ${TABLAS.map((t) => htmlTabla(p, t, vacios)).join('')}
    ${seccion('Observaciones', 'info', `${notasInc(incsDe(incs, 'observaciones'))}${p.observaciones ? `<blockquote>${esc(p.observaciones)}</blockquote>` : '<p class="vacio">Sin observaciones.</p>'}`, { open: Boolean(p.observaciones) })}
    ${htmlDiseno(p, vacios)}
    ${htmlGaleria(galeria)}
    ${htmlHermanos(p, hermanos)}
    ${seccion('Control y origen', 'gear', htmlKv([
      ['Grupo en el paquete', p.grupo_pdf],
      ['Familia', p.familia_derivada],
      ['Con gas (derivado de CO2)', p.con_gas_derivado ? 'Sí' : 'No'],
      ['PDF', p.fuente?.pdf || null],
      ['Páginas del PDF', paginas || null],
    ], false), { open: false })}
    </div>
  </article>`;
}

function textoCelda(p, tabla, clave, etiquetaFila) {
  const fila = p[tabla]?.[clave];
  if (!fila || !tieneDatos(fila)) return '—';
  const bits = [];
  if (etiquetaFila && fila.etiqueta && fila.etiqueta !== etiquetaFila) bits.push(String(fila.etiqueta));
  if (fila.std != null) bits.push(`Std ${fila.std}`);
  if (fila.max != null) bits.push(`Máx ${fila.max}`);
  if (fila.min != null) bits.push(`Mín ${fila.min}`);
  if (fila.valor != null) bits.push(String(fila.valor));
  if (fila.casilla_1 != null) bits.push(`C1 ${fila.casilla_1}`);
  if (fila.casilla_2 != null) bits.push(`C2 ${fila.casilla_2}`);
  if (fila.unidad) bits.push(String(fila.unidad));
  return bits.join(' · ');
}

const COMPARE_SIMPLES = [
  ['producto', 'Producto'],
  ['marca', 'Marca'],
  ['formato', 'Formato'],
  ['familia_derivada', 'Familia'],
  ['grupo_pdf', 'Grupo (origen)'],
  ['fecha', 'Fecha'],
  ['edicion', 'Edición'],
  ['consumo_preferente', 'Consumo preferente'],
  ['relacion_jarabe', 'Relación jarabe'],
  ['sap_mezcla', 'SAP Mezcla'],
  ['sap_mezcla_casilla_2', 'SAP Mezcla (2ª casilla)'],
  ['tipo_tapon', 'Tipo tapón'],
  ['peso_preforma_g', 'Peso preforma (g)'],
  ['color_preforma', 'Color preforma'],
  ['bandeja', 'Bandeja'],
  ['tipo_palet', 'Tipo palet'],
  ['n_capas', 'Nº capas'],
  ['cajas_palet', 'Cajas/palet'],
  ['uds_caja', 'Uds/caja'],
  ['uds_palet', 'Uds/palet'],
  ['observaciones', 'Observaciones'],
];

function htmlRelacionados(productos, relacionados) {
  const lista = relacionados || [];
  if (!lista.length || productos.length >= 3) return '';
  return `<div class="sug-cmp">
    <p class="nota">Otras fichas con el mismo SAP Mezcla. El texto entre paréntesis, si aparece, forma parte del nombre impreso en la ficha.</p>
    <div class="chip-scroller">${lista.map((p) => `<button type="button" class="chip sug" data-act="comparar-toggle" data-sap="${esc(p.codigo_sap)}">
      <span>Añadir SAP ${esc(p.codigo_sap)}</span>
      <span class="sug-mezcla">${esc(p.sap_mezcla || '')}</span>
      <span class="sug-nombre">${esc(p.producto)}</span>
    </button>`).join('')}</div>
  </div>`;
}

export function htmlComparar({ productos, relacionados }) {
  if (productos.length < 2) {
    return `<section class="comparar">
      <h1>Comparar fichas</h1>
      <p class="lead">Elige de 2 a 3 productos. Las casillas que no coinciden se marcan.</p>
      <div class="slots">${productos.map((p) => `<div class="slot"><strong>${esc(p.codigo_sap)}</strong> <span>${esc(p.producto)}</span> <button type="button" data-act="comparar-toggle" data-sap="${esc(p.codigo_sap)}">Quitar</button></div>`).join('') || '<p class="vacio">Todavía no hay fichas. Abre una ficha y pulsa Comparar.</p>'}
      </div>
      <p class="nota">Abre una ficha y pulsa Comparar. Aquí solo se proponen fichas que comparten el SAP Mezcla de las que ya has elegido.</p>
      ${htmlRelacionados(productos, relacionados)}
    </section>`;
  }
  const cabezas = productos.map((p) => `<th scope="col"><div class="cmp-head"><a class="cmp-ficha" href="?sap=${encodeURIComponent(p.codigo_sap)}"><span class="badge">SAP ${esc(p.codigo_sap)}</span><span class="cmp-nombre">${esc(p.producto)}</span></a><button type="button" class="btn btn-ghost" data-act="comparar-toggle" data-sap="${esc(p.codigo_sap)}">Quitar</button></div></th>`).join('');
  const fila = (etiqueta, valores) => {
    const distintos = new Set(valores).size > 1;
    return `<tr class="${distintos ? 'diff' : 'same'}"><th scope="row">${esc(etiqueta)}</th>${valores.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`;
  };
  const bloques = [];
  bloques.push('<tbody>');
  for (const [clave, etiqueta] of COMPARE_SIMPLES) {
    const valores = productos.map((p) => (p[clave] == null || p[clave] === '' ? '—' : String(p[clave])));
    if (valores.every((v) => v === '—')) continue;
    bloques.push(fila(etiqueta, valores));
  }
  bloques.push(fila('Con gas', productos.map((p) => (p.con_gas_derivado ? 'Sí' : 'No'))));
  bloques.push(fila('Incidencias', productos.map((p) => (p.incidencias?.length ? p.incidencias.map((i) => i.detalle).join(' | ') : '—'))));
  bloques.push('</tbody>');
  for (const tabla of TABLAS) {
    const claves = new Map();
    for (const p of productos) {
      for (const [k, filaT] of Object.entries(p[tabla.id] || {})) {
        if (tieneDatos(filaT) && !claves.has(k)) claves.set(k, filaT.etiqueta || k);
      }
    }
    if (!claves.size) continue;
    bloques.push(`<tbody><tr class="grupo"><th colspan="${productos.length + 1}">${esc(tabla.titulo)}</th></tr>`);
    for (const [k, etiqueta] of claves) {
      const valores = productos.map((p) => textoCelda(p, tabla.id, k, etiqueta));
      bloques.push(fila(etiqueta, valores));
    }
    bloques.push('</tbody>');
  }
  return `<section class="comparar">
    <h1>Comparar ${productos.length} fichas</h1>
    <p class="lead">El naranja marca filas que no coinciden. Los números son los del PDF, sin redondear.</p>
    ${htmlRelacionados(productos, relacionados)}
    <div class="cmp-wrap">
      <table class="cmp">
        <thead><tr><th scope="col">Campo</th>${cabezas}</tr></thead>
        ${bloques.join('')}
      </table>
    </div>
    <p class="leyenda"><span class="muestra diff"></span> Distinto <span class="muestra same"></span> Igual</p>
  </section>`;
}

function gruposJarabe(productos) {
  const map = new Map();
  for (const p of productos) {
    const partes = [];
    for (const [k, fila] of Object.entries(p.datos_jarabe || {})) {
      if (!tieneDatos(fila)) continue;
      partes.push([k, fila.etiqueta, fila.std ?? '', fila.max ?? '', fila.min ?? '', fila.unidad ?? '', fila.valor ?? ''].join('\u0001'));
    }
    partes.push(`rel\u0001${p.relacion_jarabe ?? ''}`);
    const firma = partes.join('\u0002');
    if (!map.has(firma)) map.set(firma, []);
    map.get(firma).push(p);
  }
  return [...map.values()];
}

export function htmlCodigos({ codigos, otros, q }) {
  const item = (c) => `<a class="g-item" href="?g=${encodeURIComponent(c.codigo)}">
      <strong>${esc(c.codigo)}</strong>
      <span>${c.n} SAP</span>
      <em>${esc(c.muestra)}</em>
    </a>`;
  return `<section>
    <h1>Códigos G</h1>
    <p class="lead">${codigos.length} códigos G y ${otros.length} mezclas que no tienen forma de código G. Cada uno abre el jarabe y los SAP que lo usan.</p>
    <div class="buscador buscador-sec">
      <label class="sr" for="qg">Filtrar códigos</label>
      <span class="buscador-ico" aria-hidden="true">${icono('search')}</span>
      <input id="qg" type="search" value="${esc(q || '')}" placeholder="Filtrar por código o por un SAP" autocomplete="off">
    </div>
    <div class="g-list">${codigos.map(item).join('') || '<p class="vacio">Ningún código G coincide.</p>'}</div>
    ${otros.length ? `<h2>Mezclas que no son código G</h2><div class="g-list">${otros.map(item).join('')}</div>` : ''}
  </section>`;
}

export function htmlCodigoG({ codigo, productos }) {
  if (!productos) {
    return `<section><h1>No está ${esc(codigo)}</h1><p>Ese código de mezcla no aparece en las fichas.</p><p><a href="?vista=codigos-g">Volver a los códigos G</a></p></section>`;
  }
  const grupos = gruposJarabe(productos);
  const bloques = grupos.map((grupo, i) => {
    const base = grupo[0];
    const tabla = htmlTabla(base, TABLAS[0], false);
    const quienes = grupos.length === 1 ? '' : `<div class="chip-scroller">${grupo.map((p) => `<a class="chip" href="?sap=${encodeURIComponent(p.codigo_sap)}">${esc(p.codigo_sap)}</a>`).join('')}</div>`;
    return `<section class="panel">
      <h2>${grupos.length === 1 ? 'Jarabe' : `Jarabe · variante ${i + 1}`}</h2>
      <p class="nota">Relación jarabe ${esc(base.relacion_jarabe || '—')}. ${grupo.length} ficha${grupo.length === 1 ? '' : 's'} con estos valores.</p>
      ${quienes}
      ${tabla}
    </section>`;
  });
  const aviso = grupos.length > 1
    ? `<aside class="banner-inc" role="status"><div class="banner-ico">${icono('warning')}</div><div><strong>El jarabe no es idéntico en todas las fichas de ${esc(codigo)}</strong><p>Se agrupan las variantes tal cual, sin unificar valores.</p></div></aside>`
    : `<p class="nota">Los parámetros de jarabe con valor coinciden en las ${productos.length} fichas.</p>`;
  return `<section class="codigo-g">
    <p class="kicker">${esCodigoG(codigo) ? 'Código G' : 'Código de mezcla'}</p>
    <h1>${esc(codigo)}</h1>
    <p class="lead">${productos.length} ficha${productos.length === 1 ? '' : 's'} SAP.</p>
    ${aviso}
    ${bloques.join('')}
    <h2>Fichas que lo usan</h2>
    <div class="cards">${productos.map(htmlTarjeta).join('')}</div>
  </section>`;
}

function valorCambio(valor) {
  if (valor == null || valor === '') return 'vacío';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  try { return JSON.stringify(valor); } catch { return String(valor); }
}

export function htmlNovedades(cambios) {
  if (!cambios) {
    return `<section><h1>Novedades</h1><p class="lead">Versión inicial: sin cambios registrados.</p></section>`;
  }
  const resumen = cambios.resumen || {};
  const bloque = (titulo, items, modificado) => {
    if (!items.length) return `<section class="panel"><h2>${esc(titulo)}</h2><p class="vacio">Ninguna.</p></section>`;
    return `<section class="panel"><h2>${esc(titulo)}</h2><ul class="novedades">${items.map((item) => {
      const enlace = item.sap ? `<a href="?sap=${encodeURIComponent(item.sap)}"><strong>SAP ${esc(item.sap)}</strong> ${esc(item.denominacion || '')}</a>` : `<strong>${esc(item.denominacion || '')}</strong>`;
      const campos = modificado && Array.isArray(item.campos) ? `<ul class="cambios">${item.campos.map((campo) => `<li><span>${esc(campo.etiqueta || campo.ruta || '')}</span><span class="antes">${esc(valorCambio(campo.antes))}</span><span class="despues">${esc(valorCambio(campo.despues))}</span></li>`).join('')}</ul>` : '';
      return `<li>${enlace}${campos}</li>`;
    }).join('')}</ul></section>`;
  };
  return `<section>
    <h1>Novedades</h1>
    <p class="lead">De ${esc(cambios.fecha_anterior || '—')} a ${esc(cambios.fecha_actual || '—')}.</p>
    <div class="stats">
      <div class="stat stat-quiet"><b>${Number(resumen.altas) || 0}</b><span>Altas</span></div>
      <div class="stat stat-quiet"><b>${Number(resumen.bajas) || 0}</b><span>Bajas</span></div>
      <div class="stat stat-quiet"><b>${Number(resumen.modificados) || 0}</b><span>Modificadas</span></div>
    </div>
    ${bloque('Altas', cambios.altas || [], false)}
    ${bloque('Bajas', cambios.bajas || [], false)}
    ${bloque('Modificadas', cambios.modificados || [], true)}
  </section>`;
}

function bloqueCambios(titulo, items, modificado) {
  if (!items.length) return `<section class="panel"><h2>${esc(titulo)}</h2><p class="vacio">Ninguna.</p></section>`;
  return `<section class="panel"><h2>${esc(titulo)}</h2><ul class="novedades">${items.map((item) => {
    const enlace = item.sap ? `<a href="?sap=${encodeURIComponent(item.sap)}"><strong>SAP ${esc(item.sap)}</strong> ${esc(item.denominacion || '')}</a>` : `<strong>${esc(item.denominacion || '')}</strong>`;
    const campos = modificado && Array.isArray(item.campos) ? `<ul class="cambios">${item.campos.map((campo) => `<li><span>${esc(campo.etiqueta || campo.ruta || '')}</span><span class="antes">${esc(valorCambio(campo.antes))}</span><span class="despues">${esc(valorCambio(campo.despues))}</span></li>`).join('')}</ul>` : '';
    return `<li>${enlace}${campos}</li>`;
  }).join('')}</ul></section>`;
}

function listaIncidencias(titulo, items) {
  if (!items?.length) return '';
  return `<section class="panel"><h2>${esc(titulo)}</h2><ul class="novedades">${items.map((item) => `<li><strong>SAP ${esc(item.sap || '')}</strong> ${esc(item.denominacion || '')}<span class="inc-linea">${esc(item.tipo || '')}${item.campo ? ` · ${esc(item.campo)}` : ''}${item.detalle ? ` · ${esc(item.detalle)}` : ''}</span></li>`).join('')}</ul></section>`;
}

export function htmlActualizar(m) {
  const fase = m.fase || 'clave';
  const runUrl = /^https:\/\/github\.com\//.test(m.runUrl || '') ? m.runUrl : '';
  const error = m.error ? `<p class="error" role="alert">${esc(m.error)}</p>${runUrl ? `<p><a href="${esc(runUrl)}" target="_blank" rel="noopener">Ver la ejecución</a></p>` : ''}` : '';
  if (fase === 'clave') {
    return `<section class="actualizar">
      <h1>Actualizar fichas</h1>
      <p class="lead">La clave de actualización no es la contraseña de las fichas. Solo abre el acceso para enviar PDF nuevos.</p>
      <form id="form-acceso">
        <label for="clave-act">Clave de actualización</label>
        <input id="clave-act" name="clave" type="password" autocomplete="current-password" required ${m.ocupado ? 'disabled' : ''} autofocus>
        <label class="check"><input type="checkbox" name="recordar" ${m.ocupado ? 'disabled' : ''}> Recordar en este dispositivo</label>
        <p class="hint">Se guarda una clave que el navegador no puede exportar. El token no se muestra ni se escribe en claro.</p>
        <button class="btn btn-primary" type="submit" ${m.ocupado ? 'disabled aria-busy="true"' : ''}>${m.ocupado ? 'Comprobando…' : 'Continuar'}</button>
        ${error}
      </form>
    </section>`;
  }
  if (fase === 'pdfs') {
    return `<section class="actualizar">
      <h1>Actualizar fichas</h1>
      <p class="lead">Elige uno o dos PDF del informe de Access: asépticos, no asépticos, o los dos. Se cifran en este dispositivo y no se suben en claro.</p>
      <form id="form-pdfs">
        ${m.pideClaveApp ? `<label for="clave-app">Contraseña de la aplicación</label><input id="clave-app" name="clave-app" type="password" autocomplete="current-password" required><p class="hint">Hace falta para cifrar los PDF. No se guarda.</p>` : ''}
        <label for="pdfs">PDF</label>
        <input id="pdfs" name="pdfs" type="file" accept="application/pdf,.pdf" multiple required>
        <div class="acciones">
          <button class="btn btn-primary" type="submit" ${m.ocupado ? 'disabled aria-busy="true"' : ''}>Enviar a revisión</button>
          <button class="btn btn-ghost" type="button" data-act="olvidar-act">Olvidar la clave de actualización</button>
        </div>
        ${error}
      </form>
    </section>`;
  }
  if (fase === 'clave-app') {
    return `<section class="actualizar">
      <h1>Abrir el informe</h1>
      <p class="lead">La revisión ha terminado. Escribe la contraseña de la aplicación para ver las altas, las bajas y los cambios.</p>
      <form id="form-clave-app">
        <label for="clave-app">Contraseña de la aplicación</label>
        <input id="clave-app" name="clave-app" type="password" autocomplete="current-password" required ${m.ocupado ? 'disabled' : ''}>
        <p class="hint">No se guarda.</p>
        <button class="btn btn-primary" type="submit" ${m.ocupado ? 'disabled aria-busy="true"' : ''}>Ver el informe</button>
        ${error}
      </form>
    </section>`;
  }
  if (fase === 'subida' || fase === 'revisando' || fase === 'publicando') {
    const pasos = fase === 'publicando'
      ? [['publicando', 'Publicando'], ['publicado', 'Publicado']]
      : [['subida', 'Subida'], ['revisando', 'Revisando'], ['informe', 'Informe']];
    const orden = pasos.map(([id]) => id);
    const actual = orden.indexOf(fase);
    return `<section class="actualizar">
      <h1>Actualizar fichas</h1>
      <ol class="pasos">${pasos.map(([id, etiqueta], i) => `<li class="${i < actual ? 'hecho' : ''} ${i === actual ? 'actual' : ''}">${esc(etiqueta)}</li>`).join('')}</ol>
      <p class="lead" role="status">${esc(m.texto || '')}</p>
      ${fase === 'revisando' ? '<p class="hint">Suele tardar entre 2 y 7 minutos. Puedes dejar esta pantalla abierta.</p>' : ''}
    </section>`;
  }
  if (fase === 'informe') {
    const cambios = m.informe?.cambios;
    const doc = m.informe?.doc || {};
    const resumen = cambios?.resumen || {};
    const avisos = doc.revision?.avisos || [];
    return `<section class="actualizar">
      <h1>Informe de la revisión</h1>
      <p class="lead">De ${esc(cambios?.fecha_anterior || '—')} a ${esc(cambios?.fecha_actual || '—')}.</p>
      ${avisos.length ? `<div class="aviso-act" role="note">${avisos.map((a) => `<p>${esc(a)}</p>`).join('')}</div>` : ''}
      <div class="stats">
        <div class="stat stat-quiet"><b>${Number(resumen.altas) || 0}</b><span>Altas</span></div>
        <div class="stat stat-quiet"><b>${Number(resumen.bajas) || 0}</b><span>Bajas</span></div>
        <div class="stat stat-quiet"><b>${Number(resumen.modificados) || 0}</b><span>Modificadas</span></div>
      </div>
      ${bloqueCambios('Altas', cambios?.altas || [], false)}
      ${bloqueCambios('Bajas', cambios?.bajas || [], false)}
      ${bloqueCambios('Modificadas', cambios?.modificados || [], true)}
      ${listaIncidencias('Incidencias nuevas', doc.incidencias_nuevas)}
      ${listaIncidencias('Incidencias resueltas', doc.incidencias_resueltas)}
      <div class="acciones">
        <button type="button" class="btn btn-primary" data-act="aprobar-act" ${m.ocupado ? 'disabled' : ''}>Aprobar y publicar</button>
        <button type="button" class="btn btn-ghost" data-act="descartar-act" ${m.ocupado ? 'disabled' : ''}>Descartar</button>
      </div>
      ${error}
    </section>`;
  }
  if (fase === 'publicado') {
    return `<section class="actualizar">
      <h1>Publicado</h1>
      <p class="lead">Las fichas nuevas ya están en la web. Recarga para descargarlas.</p>
      <button type="button" class="btn btn-primary" data-act="recargar-act">Recargar las fichas</button>
    </section>`;
  }
  return `<section class="actualizar">
    <h1>Actualizar fichas</h1>
    ${error || '<p class="error" role="alert">No se ha podido completar la actualización.</p>'}
    <button type="button" class="btn btn-primary" data-act="reintentar-act">Volver a empezar</button>
  </section>`;
}

export function htmlResultadoEan({ codigo, productosLista }) {
  if (!productosLista.length) {
    return `<section><h1>Código de barras</h1><p class="lead">Ninguna ficha tiene el EAN ${esc(codigo)}.</p><p>Se han buscado la unidad, el pack, la caja y el palet, con y sin ceros a la izquierda.</p></section>`;
  }
  return `<section><h1>${productosLista.length} ficha${productosLista.length === 1 ? '' : 's'} con el EAN ${esc(codigo)}</h1><div class="cards">${productosLista.map(htmlTarjeta).join('')}</div></section>`;
}

export function htmlEscaner() {
  return `<div class="scan" role="dialog" aria-modal="true" aria-label="Escanear código de barras">
    <div class="scan-bar">
      <p>Apunta al código de barras de la botella o de la caja.</p>
      <button type="button" class="btn btn-ghost" data-act="cerrar-escaner">Cerrar</button>
    </div>
    <video class="scan-video" autoplay playsinline muted></video>
    <p class="scan-estado" role="status"></p>
  </div>`;
}

export function htmlCompartir(sap) {
  return `<div class="share" role="dialog" aria-modal="true" aria-labelledby="share-tit">
    <h2 id="share-tit">Compartir SAP ${esc(sap)}</h2>
    <p>El enlace solo funciona para quien tenga la contraseña de la aplicación. Los datos no viajan en el enlace: se descifran en el dispositivo.</p>
    <div class="acciones">
      <button type="button" class="btn btn-primary" data-act="compartir-ahora" data-sap="${esc(sap)}">${icono('share')} Compartir</button>
      <button type="button" class="btn btn-secondary" data-act="copiar-sap" data-sap="${esc(sap)}">Copiar enlace</button>
      <button type="button" class="btn btn-ghost" data-act="cerrar-compartir">Cerrar</button>
    </div>
  </div>`;
}

export function htmlLightbox(lb) {
  const item = lb.items[lb.index];
  return `<div class="lb" role="dialog" aria-modal="true" aria-label="Imagen ampliada">
    <div class="lb-bar">
      <p id="lb-cap">${esc(item.alt)} <span>${lb.index + 1} / ${lb.items.length}</span></p>
      <div class="lb-tools">
        <button type="button" data-act="zoom" data-z="-0.25" aria-label="Alejar">−</button>
        <button type="button" data-act="zoom" data-z="reset" aria-label="Ajustar">Ajustar</button>
        <button type="button" data-act="zoom" data-z="0.25" aria-label="Acercar">+</button>
        <button type="button" data-act="lb-close" aria-label="Cerrar imagen">${icono('close')}</button>
      </div>
    </div>
    <button type="button" class="lb-nav prev" data-act="lb-nav" data-dir="-1" aria-label="Imagen anterior">${icono('chevron')}</button>
    <div id="lb-stage" class="lb-stage">
      <img id="lb-img" alt="${esc(item.alt)}" src="${esc(item.url)}" data-hash="${esc(item.hash || '')}" draggable="false">
    </div>
    <button type="button" class="lb-nav next" data-act="lb-nav" data-dir="1" aria-label="Imagen siguiente">${icono('chevron')}</button>
  </div>`;
}

export function htmlDock(productos) {
  if (!productos.length) return '';
  return `<div class="dock-in">
    <p>${productos.length} en la comparación</p>
    <div class="dock-codes">${productos.map((p) => `<a href="?sap=${encodeURIComponent(p.codigo_sap)}">${esc(p.codigo_sap)}</a>`).join('')}</div>
    <a class="btn btn-primary" href="?vista=comparar">Ver</a>
  </div>`;
}

export { fechaPaquete };
