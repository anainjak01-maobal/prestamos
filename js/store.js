// Estado de la app, cuenta (usuario/contraseña) y guardado cifrado en IndexedDB.
import * as idb from './idb.js';
import * as C from './crypto.js';
import { uid, today } from './utils.js';

export const FORMATO = 1;
let key = null;
let meta = null;
export let state = null;

export function emptyState() {
  return {
    formato: FORMATO,
    config: {
      negocio: 'Control de Cobros',
      indicativo: '57',
      tasa: 20,            // % de interés por defecto
      tasaAdicional: 20,   // % del interés sobre interés
      cobraDomingos: true,
      alertaMora: 5,       // días de mora para alerta
      bloqueoMin: 5,       // minutos de inactividad para bloquear
      ultimoRespaldo: null,
    },
    clientes: [],
    prestamos: [],
    socios: [],
    gastos: [],            // { id, ts, fecha, tipo: 'gasto' | 'retiro', categoria, valor, nota }
    adicionalesHist: [],   // adicionales históricos del Excel, ya cobrados: { id, nombre, clienteId, valor, nota, fila, origen }
  };
}

function migrate(s) {
  const base = emptyState();
  s.config = { ...base.config, ...(s.config || {}) };
  s.clientes ||= [];
  s.prestamos ||= [];
  s.socios ||= [];
  s.gastos ||= [];
  s.adicionalesHist ||= [];
  s.formato = FORMATO;
  return s;
}

export const isUnlocked = () => !!(key && state);
export async function hasAccount() {
  return !!(await idb.get('meta'));
}

export async function createAccount(usuario, clave, initial = null) {
  const salt = C.randBytes(16);
  const k = await C.deriveKey(C.credencial(usuario, clave), salt);
  const m = { formato: FORMATO, salt: C.toB64(salt), iter: C.ITER, creado: new Date().toISOString() };
  const s = migrate(initial || emptyState());
  await idb.set('data', await C.encryptJSON(k, s));
  await idb.set('meta', m);
  key = k; meta = m; state = s;
  idb.persist();
}

export async function login(usuario, clave) {
  const m = await idb.get('meta');
  const box = await idb.get('data');
  if (!m || !box) return false;
  const k = await C.deriveKey(C.credencial(usuario, clave), C.fromB64(m.salt), m.iter);
  try {
    state = migrate(await C.decryptJSON(k, box));
  } catch {
    return false;
  }
  key = k; meta = m;
  idb.persist();
  return true;
}

export function lock() {
  key = null;
  state = null;
}

let cola = Promise.resolve();
/** Guarda el estado actual cifrado. Las escrituras se encolan para no pisarse. */
export function save() {
  const k = key, s = state;
  if (!k || !s) return cola;
  cola = cola.then(() => C.encryptJSON(k, s)).then((box) => idb.set('data', box)).catch((e) => {
    console.error('Error guardando', e);
    throw e;
  });
  return cola;
}

/** Cambia usuario y/o contraseña: vuelve a cifrar todo con una clave nueva. */
export async function changeCredentials(usuarioActual, claveActual, usuarioNuevo, claveNueva) {
  const k = await C.deriveKey(C.credencial(usuarioActual, claveActual), C.fromB64(meta.salt), meta.iter);
  try { await C.decryptJSON(k, await idb.get('data')); } catch { return false; }
  const salt = C.randBytes(16);
  const nk = await C.deriveKey(C.credencial(usuarioNuevo, claveNueva), salt);
  const m = { ...meta, salt: C.toB64(salt), iter: C.ITER };
  await cola;
  await idb.set('data', await C.encryptJSON(nk, state));
  await idb.set('meta', m);
  key = nk; meta = m;
  return true;
}

export async function wipeAll() {
  await cola;
  await idb.clear();
  lock();
}

// ---- Respaldo ----
/** Archivo de respaldo cifrado: lleva la sal para poder abrirlo en otro teléfono con el mismo usuario y contraseña. */
export async function buildBackup() {
  const box = await C.encryptJSON(key, state);
  return {
    app: 'control-de-cobros',
    formato: FORMATO,
    fecha: new Date().toISOString(),
    salt: meta.salt,
    iter: meta.iter,
    ...box,
  };
}

export function isBackup(obj) {
  return obj && obj.app === 'control-de-cobros' && obj.salt && obj.iv && obj.ct;
}

/** Abre un respaldo con su usuario y contraseña. Devuelve los datos o null. */
export async function openBackup(obj, usuario, clave) {
  const k = await C.deriveKey(C.credencial(usuario, clave), C.fromB64(obj.salt), obj.iter || C.ITER);
  try {
    return migrate(await C.decryptJSON(k, { iv: obj.iv, ct: obj.ct }));
  } catch {
    return null;
  }
}

/** Reemplaza los datos actuales (sesión abierta) por los de un respaldo. */
export async function replaceState(newState) {
  const prevBackup = state?.config?.ultimoRespaldo;
  state = migrate(newState);
  if (!state.config.ultimoRespaldo) state.config.ultimoRespaldo = prevBackup || null;
  await save();
}

/** Reemplaza clientes, préstamos y socios por los del Excel, conservando los ajustes. */
export async function importMigration(datos) {
  state.clientes = datos.clientes || [];
  state.prestamos = datos.prestamos || [];
  state.socios = datos.socios || [];
  await save();
}

/** En un teléfono nuevo: restaura el respaldo y deja como acceso el usuario/contraseña del respaldo. */
export async function restoreOnNewDevice(obj, usuario, clave) {
  const data = await openBackup(obj, usuario, clave);
  if (!data) return false;
  await createAccount(usuario, clave, data);
  return true;
}

// ---- Helpers de datos ----
export const getCliente = (id) => state.clientes.find((c) => c.id === id);
export const getPrestamo = (id) => state.prestamos.find((p) => String(p.id) === String(id));
export const getSocio = (id) => state.socios.find((s) => s.id === id);
export const prestamosDe = (clienteId) => state.prestamos.filter((p) => p.clienteId === clienteId);

export function nextCodigoCliente() {
  let max = 0;
  for (const c of state.clientes) {
    const n = parseInt(String(c.codigo || '').replace(/\D/g, ''), 10);
    if (n > max) max = n;
  }
  return `Cli_${String(max + 1).padStart(3, '0')}`;
}
export function nextPrestamoId() {
  return state.prestamos.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
}

export function addCliente(data) {
  const c = { id: uid(), codigo: nextCodigoCliente(), creado: today(), ...data };
  state.clientes.push(c);
  return c;
}
export function addPrestamo(data) {
  const p = { id: nextPrestamoId(), estado: 'activo', movs: [], creado: new Date().toISOString(), ...data };
  state.prestamos.push(p);
  return p;
}
export function addMov(p, mov) {
  const m = { id: uid(), ts: Date.now(), ...mov };
  p.movs.push(m);
  return m;
}
