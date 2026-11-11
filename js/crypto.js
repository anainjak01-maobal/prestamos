// Cifrado de los datos con la contraseña del usuario (Web Crypto: PBKDF2 + AES-GCM 256).
const enc = new TextEncoder();
const dec = new TextDecoder();
export const ITER = 310000;

export const randBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function toB64(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** La credencial combina usuario (sin distinguir mayúsculas) y contraseña. */
export const credencial = (usuario, clave) => `${String(usuario).trim().toLowerCase()}\n${clave}`;

export async function deriveKey(cred, salt, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(cred), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(key, obj) {
  const iv = randBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Lanza error si la clave no es la correcta. */
export async function decryptJSON(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
  return JSON.parse(dec.decode(pt));
}
