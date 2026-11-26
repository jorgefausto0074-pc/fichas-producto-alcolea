import { formatoGramos, formatoPct } from './calculo.js';

export function csvFicha({ titulo, filas }) {
  const linea = (cols) => cols.join(';');
  const filasCsv = [
    linea(['Zona', 'Mín', 'Medio', 'Máx', '%']),
    ...filas.map((f) => linea([f.nombre, formatoGramos(f.minC), formatoGramos(f.medioC), formatoGramos(f.maxC), formatoPct(f.pct)])),
  ];
  const cabecera = titulo ? [`${titulo}`] : [];
  return [...cabecera, ...filasCsv].join('\r\n');
}
