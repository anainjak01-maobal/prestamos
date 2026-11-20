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
      diasPorVencer: 7,    // días antes del fin del plazo para mostrarlo en "Por vencer"
      bloqueoMin: 5,       // minutos de inactividad para bloquear
      ultimoRespaldo: null,
      diasRespaldo: 7,     // recordar el respaldo cada N días
      cambiosSinRespaldo: 0, // cambios guardados desde el último respaldo
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
  sesionExpira = 0;
  idb.del('sesion').catch(() => {});
  try { sessionStorage.removeItem(MARCA); } catch { /* sin sessionStorage */ }
}

// ---- Sesión abierta ----
// El teléfono puede cerrar la app cuando pasas a otra (WhatsApp, etc.). Para no pedir la contraseña al volver,
// la clave se guarda en IndexedDB mientras no se cumpla el tiempo de bloqueo. Es una CryptoKey NO exportable:
// sirve para descifrar en este navegador, pero no se puede sacar ni copiar. Al bloquear se borra.
// Además lleva una MARCA que vive en sessionStorage: el navegador la conserva si el teléfono cierra la app por
// detrás, pero la borra cuando el usuario cierra la app (la desliza en "recientes") o la abre de nuevo desde el
// ícono en otra ventana. Sin la marca, la sesión no sirve y se pide la contraseña.
const MARCA = 'cobros-sesion';
let sesionExpira = 0;
function marcaSesion() {
  try {
    let t = sessionStorage.getItem(MARCA);
    if (!t) { t = C.toB64(C.randBytes(16)); sessionStorage.setItem(MARCA, t); }
    return t;
  } catch { return null; }
}
/** Guarda (o renueva) la sesión hasta la hora indicada (ms). */
export async function guardarSesion(expira) {
  if (!key || !state) return;
  const marca = marcaSesion();
  if (!marca) return; // sin sessionStorage no se guarda la sesión: siempre pedirá la contraseña
  sesionExpira = expira;
  try { await idb.set('sesion', { key, expira, marca }); } catch (e) { console.warn('Sesión', e); }
}
/** Si hay una sesión vigente, abre los datos sin pedir la contraseña. Devuelve true si lo logró. */
export async function restaurarSesion() {
  try {
    const ses = await idb.get('sesion');
    let marca = null;
    try { marca = sessionStorage.getItem(MARCA); } catch { /* nada */ }
    if (!ses?.key || !(ses.expira > Date.now()) || !marca || ses.marca !== marca) {
      if (ses) await idb.del('sesion');
      return false;
    }
    const m = await idb.get('meta');
    const box = await idb.get('data');
    if (!m || !box) return false;
    state = migrate(await C.decryptJSON(ses.key, box));
    key = ses.key; meta = m; sesionExpira = ses.expira;
    return true;
  } catch {
    try { await idb.del('sesion'); } catch { /* nada */ }
    state = null; key = null;
    return false;
  }
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
  if (sesionExpira) await guardarSesion(sesionExpira); // la sesión guardada debe usar la clave nueva
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
  state.config.cambiosSinRespaldo = 0; // los datos son los del respaldo
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
