import { EAN_CLAVES } from './util.js';

export function digitosEan(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function anadir(conjunto, valor) {
  if (valor && valor.length >= 8) conjunto.add(valor);
}

/** Claves comparables: dígitos, sin ceros a la izquierda, GTIN-14 y el cuerpo sin dígito de control. */
export function clavesEan(valor) {
  const d = digitosEan(valor);
  const claves = new Set();
  if (d.length < 8) return claves;
  const sinCeros = d.replace(/^0+/, '');
  anadir(claves, d);
  anadir(claves, sinCeros);
  if (sinCeros.length <= 14) anadir(claves, sinCeros.padStart(14, '0'));
  if (sinCeros.length <= 13) anadir(claves, sinCeros.padStart(13, '0'));
  if (d.length >= 12) anadir(claves, `C${d.slice(0, -1).replace(/^0+/, '')}`);
  if (d.length === 14) anadir(claves, `C${d.slice(1, 13).replace(/^0+/, '')}`);
  return claves;
}

export function eanCoincide(a, b) {
  const A = clavesEan(a);
  const B = clavesEan(b);
  for (const clave of A) {
    if (B.has(clave)) return true;
  }
  return false;
}

export function eansDeProducto(producto) {
  const diseno = producto?.diseno || {};
  const lista = [];
  for (const clave of EAN_CLAVES) {
    if (diseno[clave]) lista.push(String(diseno[clave]));
  }
  if (producto?.n_producto_ean128) lista.push(String(producto.n_producto_ean128));
  return lista;
}

export function fichasPorEan(productos, codigo) {
  const buscadas = clavesEan(codigo);
  if (!buscadas.size) return [];
  return productos.filter((producto) => eansDeProducto(producto).some((ean) => {
    const claves = clavesEan(ean);
    for (const clave of buscadas) {
      if (claves.has(clave)) return true;
    }
    return false;
  }));
}
