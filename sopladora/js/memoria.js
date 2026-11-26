// Preferencias de la calculadora en este dispositivo. No guarda la contraseña.

const CLAVE = 'calculadora-sopladora-memoria';

const vacia = () => ({
  gramajes: {},
  historial: [],
  favoritos: [],
  medidos: {},
  modoLinea: false,
  comparar: [],
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
  memoria.historial = [entrada, ...memoria.historial.filter((h) => !(h.fichaId === entrada.fichaId && h.n === entrada.n))].slice(0, 12);
  guardarMemoria(memoria);
}

export function borrarHistorial(memoria, indice) {
  if (indice == null) memoria.historial = [];
  else memoria.historial.splice(indice, 1);
  guardarMemoria(memoria);
}
