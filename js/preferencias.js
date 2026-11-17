const FAV = 'fichas-pt-fav';
const REC = 'fichas-pt-recientes';
const PLANTA = 'fichas-pt-planta';

function leerCodigos(clave) {
  try {
    const valor = JSON.parse(localStorage.getItem(clave) || '[]');
    if (!Array.isArray(valor)) return [];
    return valor.map((item) => String(item)).filter((item) => /^\d{5,10}$/.test(item));
  } catch {
    return [];
  }
}

function guardarCodigos(clave, lista) {
  localStorage.setItem(clave, JSON.stringify(lista));
}

export function favoritos() {
  return leerCodigos(FAV);
}

export function esFavorito(sap) {
  return favoritos().includes(String(sap));
}

export function toggleFavorito(sap) {
  const codigo = String(sap);
  const lista = favoritos();
  const siguiente = lista.includes(codigo) ? lista.filter((item) => item !== codigo) : [codigo, ...lista];
  guardarCodigos(FAV, siguiente);
  return siguiente.includes(codigo);
}

export function limpiarFavoritos() {
  localStorage.removeItem(FAV);
}

export function recientes() {
  return leerCodigos(REC).slice(0, 15);
}

export function anotarReciente(sap) {
  const codigo = String(sap);
  if (!/^\d{5,10}$/.test(codigo)) return;
  guardarCodigos(REC, [codigo, ...recientes().filter((item) => item !== codigo)].slice(0, 15));
}

export function limpiarRecientes() {
  localStorage.removeItem(REC);
}

export function plantaActiva() {
  try {
    return localStorage.getItem(PLANTA) === '1';
  } catch {
    return false;
  }
}

export function fijarPlanta(activa) {
  try {
    localStorage.setItem(PLANTA, activa ? '1' : '0');
  } catch { /* modo privado */ }
  document.documentElement.classList.toggle('planta', Boolean(activa));
}

export function aplicarPlantaGuardada() {
  document.documentElement.classList.toggle('planta', plantaActiva());
}
