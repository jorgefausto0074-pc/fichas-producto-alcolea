// De una ficha de 4 zonas a una de 3 por el hash: la vista nueva se monta entera
// y no se tocan los pesos de la ficha que todavía está en pantalla.
// Las dos fichas son de prueba, como la de ficha15.mjs. No se publican.

import { prepararFicha } from '../js/calculo.js';
import { refrescarFoto } from '../js/foto.js';

function zona(orden, clave, nombre, min, max, medio) {
  return { orden, clave, nombre, min, max, medio };
}

function ficha(id, codigo, zonas) {
  const suma = zonas.reduce((s, z) => s + z.medio, 0);
  return {
    id,
    ficha_codigo: codigo,
    gas: 'con_gas',
    capacidad_l: '1,5',
    n_zonas: zonas.length,
    suma_medios_zonas: suma,
    cortes_cm: zonas.slice(0, -1).map((_, i) => (i + 1) * 8),
    zonas,
  };
}

const cuatro = ficha('s06-19', '1,5 L CUATRO', [
  zona(1, 'hombro', 'Hombro', 8, 9, 8.5),
  zona(2, 'zona2', 'Zona 2', 9, 10, 9.5),
  zona(3, 'zona1', 'Zona 1', 13, 14, 13.5),
  zona(4, 'base', 'Base / Fondo', 8, 9, 8.5),
]);
const tres = ficha('s05-16', '1,5 L TRES', [
  zona(1, 'hombro', 'Hombro', 11, 12, 11.5),
  zona(2, 'zona1', 'Zona 1', 12, 14, 13),
  zona(3, 'base', 'Base / Fondo', 7, 8, 7.5),
]);

class Nodo {
  constructor(etiqueta, clase = '') {
    this.etiqueta = etiqueta;
    this.className = clase;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.conectado = false;
  }

  get isConnected() {
    return this.conectado;
  }

  get classList() {
    const nombre = this.className;
    return { contains: (c) => nombre.split(/\s+/).includes(c) };
  }

  closest(sel) {
    let n = this;
    while (n) {
      if (sel === 'article.ficha' && n.etiqueta === 'article' && n.className.includes('ficha')) return n;
      n = n.parent;
    }
    return null;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => {
      if (sel === '[data-peso]' && n.dataset.peso != null) out.push(n);
      if (sel === 'h1' && n.etiqueta === 'h1') out.push(n);
      n.children.forEach(walk);
    };
    walk(this);
    return out;
  }

  append(...nodos) {
    for (const n of nodos) {
      n.parent = this;
      n.marcar(this.conectado);
      this.children.push(n);
    }
  }

  marcar(valor) {
    this.conectado = valor;
    this.children.forEach((h) => h.marcar(valor));
  }

  replaceChildren(nodo) {
    this.children.forEach((h) => h.marcar(false));
    this.children = [];
    if (nodo) this.append(nodo);
  }
}

function pesos(n, fichaOrigen) {
  const prep = prepararFicha(fichaOrigen);
  const articulo = new Nodo('article', 'ficha');
  const titulo = new Nodo('h1');
  titulo.textContent = fichaOrigen.ficha_codigo;
  articulo.append(titulo);
  prep.zonas.forEach((z, i) => {
    const celda = new Nodo('strong');
    celda.dataset.peso = String(i);
    celda.textContent = `${z.medioC}`;
    articulo.append(celda);
  });
  return { articulo, prep, titulo };
}

const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
  else console.log('ok', msg);
}

const vieja = pesos(4, cuatro);
const nueva = pesos(3, tres);
const app = new Nodo('div');
app.conectado = true;
app.append(vieja.articulo);

const textosViejos = vieja.articulo.querySelectorAll('[data-peso]').map((n) => n.textContent);
let exploto = false;
try {
  refrescarFoto(nueva.articulo, nueva.prep, null);
} catch {
  exploto = true;
}
ok(!exploto, 'pasar de 4 zonas a 3 no lanza un error');
ok(vieja.titulo.textContent === '1,5 L CUATRO', 'el título de la ficha visible no cambia antes de sustituirla');
ok(vieja.articulo.querySelectorAll('[data-peso]').every((n, i) => n.textContent === textosViejos[i]), 'los pesos de la ficha de 4 zonas siguen siendo los suyos');

app.replaceChildren(nueva.articulo);
ok(app.querySelectorAll('h1')[0].textContent === '1,5 L TRES', 'la vista nueva trae el título de la ficha de 3 zonas');
ok(app.querySelectorAll('[data-peso]').length === 3, 'la vista nueva tiene las 3 zonas, no las 4 anteriores');

let explotoOtra = false;
try {
  refrescarFoto(nueva.articulo, nueva.prep, null);
} catch {
  explotoOtra = true;
}
ok(!explotoOtra, 'actualizar la ficha ya montada tampoco falla');

if (fallos.length) {
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('cambio de ficha correcto');
