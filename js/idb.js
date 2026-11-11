// Almacenamiento clave-valor en IndexedDB (persistente en el teléfono).
const DB = 'cobros-db';
const STORE = 'kv';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    const r = fn(st);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export const get = (k) => tx('readonly', (st) => st.get(k));
export const set = (k, v) => tx('readwrite', (st) => st.put(v, k));
export const del = (k) => tx('readwrite', (st) => st.delete(k));
export const clear = () => tx('readwrite', (st) => st.clear());

/** Pide al navegador que no borre los datos automáticamente. */
export async function persist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* sin soporte */ }
}
