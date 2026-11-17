// Guarda la CryptoKey derivada (no exportable) en IndexedDB. Nunca la contraseña.

const DB = 'fichas-pt-alcolea';
const STORE = 'claves';
const ID = 'sesion';

function abrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transaccion(db, modo, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const result = fn(tx.objectStore(STORE));
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
