// Preferencias de la calculadora en este dispositivo. No guarda la contraseña.

const CLAVE = 'calculadora-sopladora-memoria';

const vacia = () => ({
  gramajes: {},
  historial: [],
  favoritos: [],
  medidos: {},
  modoLinea: false,
  comparar: [],
  ajustes: {},
});

export function leerMemoria() {
  try {
    const dato = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    return { ...vacia(), ...(dato || {}) };
  } catch {
    return vacia();
  }
}

export function guardarMemoria(memoria) {
  localStorage.setItem(CLAVE, JSON.stringify(memoria));
}

export function recordarGramaje(memoria, fichaId, texto) {
  memoria.gramajes[fichaId] = texto;
  guardarMemoria(memoria);
}

export function anotarCalculo(memoria, entrada) {
  const nota = entrada.nota || '';
  memoria.historial = [entrada, ...memoria.historial.filter((h) => !(h.fichaId === entrada.fichaId && h.n === entrada.n && (h.nota || '') === nota))].slice(0, 12);
  guardarMemoria(memoria);
}

export function guardarAjuste(memoria, fichaId, ajuste) {
  memoria.ajustes = memoria.ajustes || {};
  if (!ajuste) delete memoria.ajustes[fichaId];
  else memoria.ajustes[fichaId] = ajuste;
  guardarMemoria(memoria);
}

export function quitarComparada(memoria, id) {
  memoria.comparar = (memoria.comparar || []).filter((x) => x !== id);
  guardarMemoria(memoria);
}

export function vaciarComparacion(memoria) {
  memoria.comparar = [];
  guardarMemoria(memoria);
}

export function borrarHistorial(memoria, indice) {
  if (indice == null) memoria.historial = [];
  else memoria.historial.splice(indice, 1);
  guardarMemoria(memoria);
}
