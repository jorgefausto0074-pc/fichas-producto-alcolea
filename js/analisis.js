import { parseNum } from './util.js';

export function parseMedida(valor) {
  if (valor == null) return null;
  const texto = String(valor).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function presenteNoNumerico(valor) {
  return valor != null && valor !== '' && parseNum(valor) == null;
}

export function rangoIncoherente(fila, incidencias) {
  if ((incidencias || []).some((i) => i.tipo === 'rango_incoherente_en_pdf' || i.tipo === 'valor_no_numerico_en_pdf')) {
    return true;
  }
  if (presenteNoNumerico(fila?.min) || presenteNoNumerico(fila?.max) || presenteNoNumerico(fila?.std)) return true;
  const min = parseNum(fila?.min);
  const max = parseNum(fila?.max);
  const std = parseNum(fila?.std);
  if (min != null && max != null && max < min) return true;
  if (std != null && min != null && max != null && (std < min || std > max)) return true;
  return false;
}

function decimales(valor) {
  const texto = String(valor ?? '').trim().replace(/\s/g, '').replace(',', '.');
  const parte = texto.split('.')[1];
  return parte ? parte.length : 0;
}

export function textoDesviacion(delta, fila, medidaOriginal) {
  const precision = Math.min(6, Math.max(
    decimales(medidaOriginal),
    decimales(fila?.std),
    decimales(fila?.min),
    decimales(fila?.max),
  ));
  const fijo = delta.toFixed(precision);
  const limpio = precision ? fijo.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : fijo;
  const separador = String(medidaOriginal).includes(',') ? ',' : '.';
  const conSigno = `${delta > 0 ? '+' : ''}${limpio}`.replace('.', separador);
  return conSigno;
}

/** estado: vacio | no-numerico | incoherente | sin-rango | ok | fuera */
export function juzgarMedida(fila, texto, incidencias) {
  const escrito = String(texto ?? '');
  if (!escrito.trim()) return { estado: 'vacio' };
  if (rangoIncoherente(fila, incidencias)) return { estado: 'incoherente' };
  const medido = parseMedida(escrito);
  if (medido == null) return { estado: 'no-numerico' };
  const min = parseNum(fila?.min);
  const max = parseNum(fila?.max);
  const std = parseNum(fila?.std);
  if (min == null && max == null) {
    return {
      estado: 'sin-rango',
      desviacion: std == null ? null : textoDesviacion(medido - std, fila, escrito),
    };
  }
  let dentro = true;
  if (min != null && medido < min) dentro = false;
  if (max != null && medido > max) dentro = false;
  return {
    estado: dentro ? 'ok' : 'fuera',
    desviacion: std == null ? null : textoDesviacion(medido - std, fila, escrito),
  };
}

export function textoJuicio(resultado) {
  if (!resultado || resultado.estado === 'vacio') return '';
  if (resultado.estado === 'incoherente') return 'El rango del PDF es incoherente. No se valora.';
  if (resultado.estado === 'no-numerico') return 'Escribe un número. Vale la coma o el punto.';
  if (resultado.estado === 'sin-rango') {
    return resultado.desviacion
      ? `Sin máximo ni mínimo en el PDF. Desviación respecto al estándar: ${resultado.desviacion}`
      : 'Sin máximo ni mínimo en el PDF.';
  }
  const base = resultado.estado === 'ok' ? 'Dentro de mínimo y máximo.' : 'Fuera de mínimo y máximo.';
  return resultado.desviacion ? `${base} Desviación respecto al estándar: ${resultado.desviacion}` : base;
}
