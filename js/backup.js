// Exportar e importar el respaldo (archivo .json cifrado).
import * as store from './store.js';
import { today } from './utils.js';

export function backupFileName() {
  return `cobros-respaldo-${today()}.json`;
}

/** Comparte el respaldo (WhatsApp, Drive, correo…) o lo descarga si el navegador no puede compartir. */
export async function exportBackup({ preferShare = true } = {}) {
  const data = await store.buildBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = backupFileName();
  let via = 'descarga';
  const file = new File([blob], name, { type: 'application/json' });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Respaldo Control de Cobros' });
      via = 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return null; // el usuario canceló
      download(blob, name);
    }
  } else {
    download(blob, name);
  }
  store.state.config.ultimoRespaldo = new Date().toISOString();
  await store.save();
  return via;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Abre el selector y devuelve el archivo de migración del Excel (generado por herramientas/excel_a_app.py). */
export function pickMigrationFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const obj = JSON.parse(await f.text());
        if (obj?.app !== 'control-de-cobros' || obj?.tipo !== 'migracion-excel' || !obj.datos) {
          return reject(new Error('El archivo no es una migración del Excel (migracion-excel.json).'));
        }
        resolve(obj);
      } catch {
        reject(new Error('No se pudo leer el archivo.'));
      }
    };
    input.click();
  });
}

/** Abre el selector de archivos y devuelve el respaldo leído (sin descifrar). */
export function pickBackupFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const obj = JSON.parse(await f.text());
        if (!store.isBackup(obj)) return reject(new Error('El archivo no es un respaldo de esta app.'));
        resolve(obj);
      } catch {
        reject(new Error('No se pudo leer el archivo.'));
      }
    };
    input.click();
  });
}
