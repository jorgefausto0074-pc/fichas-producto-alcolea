// Guarda la CryptoKey derivada (no exportable) en IndexedDB. Nunca la contraseña.

const DB = 'fichas-pt-alcolea';
const STORE = 'claves';
const STORE_ACCESO = 'acceso';
const ID = 'sesion';
const ID_ACCESO = 'envuelto';

function abrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(STORE_ACCESO)) db.createObjectStore(STORE_ACCESO);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transaccion(db, modo, fn, store = STORE) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function guardarClave(key, meta) {
  const db = await abrir();
  try {
    await transaccion(db, 'readwrite', (store) => {
      store.put({ key, sal_hex: meta.sal_hex }, ID);
    });
  } finally {
    db.close();
  }
}

export async function leerClave() {
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function borrarClave() {
  const db = await abrir();
  try {
    await transaccion(db, 'readwrite', (store) => {
      store.delete(ID);
    });
  } finally {
    db.close();
  }
}

export async function guardarAccesoEnvuelto(registro) {
  const db = await abrir();
  try {
    await transaccion(db, 'readwrite', (store) => {
      store.put(registro, ID_ACCESO);
    }, STORE_ACCESO);
  } finally {
    db.close();
  }
}

export async function leerAccesoEnvuelto() {
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ACCESO, 'readonly');
      const req = tx.objectStore(STORE_ACCESO).get(ID_ACCESO);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function borrarAccesoEnvuelto() {
  const db = await abrir();
  try {
    await transaccion(db, 'readwrite', (store) => {
      store.delete(ID_ACCESO);
    }, STORE_ACCESO);
  } finally {
    db.close();
  }
}
