// Aviso de versión nueva y pantalla de novedades.
import { VERSION } from './version.js';
import { icon } from './icons.js';
import { esc, fdate } from './utils.js';
import { sheet, toast } from './ui.js';

const CLAVE_VISTA = 'cobros-version-vista';

function esMayor(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function leerVersionPublicada() {
  const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('sin respuesta');
  return r.json();
}

/** Revisa si hay una versión publicada más nueva. Muestra el aviso si la hay. */
export async function buscarActualizacion({ avisarSiNoHay = false } = {}) {
  try {
    const v = await leerVersionPublicada();
    if (v?.version && esMayor(v.version, VERSION)) {
      mostrarAviso(v);
      return v;
    }
    if (avisarSiNoHay) toast(`Ya tienes la última versión (${VERSION})`);
  } catch {
    if (avisarSiNoHay) toast('No se pudo revisar: ¿hay internet?', 'err');
  }
  return null;
}

function mostrarAviso(v) {
  if (document.getElementById('update-banner')) return;
  const el = document.createElement('div');
  el.id = 'update-banner';
  el.className = 'update-banner';
  el.innerHTML = `<span class="ico">${icon('refresh', 'sm')}</span>
    <span class="grow"><b>Hay una versión nueva</b><br><span class="small muted">Versión ${esc(v.version)}</span></span>
    <button class="btn primary sm" data-up>Actualizar</button>
    <button class="icon-btn" data-x aria-label="Después">${icon('x', 'sm')}</button>`;
  document.body.appendChild(el);
  el.querySelector('[data-up]').onclick = (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Actualizando…';
    actualizar();
  };
  el.querySelector('[data-x]').onclick = () => el.remove();
}

function esperarActivo(reg, ms = 6000) {
  return new Promise((resolve) => {
    const sw = reg?.installing || reg?.waiting;
    if (!sw) return resolve();
    const t = setTimeout(resolve, ms);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated' || sw.state === 'redundant') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

/** Descarga la versión nueva y recarga la app. Los datos no se tocan. */
export async function actualizar() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      await esperarActivo(reg);
    }
    const ks = await caches.keys();
    await Promise.all(ks.map((k) => caches.delete(k)));
  } catch { /* se recarga igual */ }
  location.reload();
}

/** Después de actualizar, muestra una vez las novedades de la versión. */
export async function mostrarNovedadesSiCorresponde() {
  let vista = null;
  try { vista = localStorage.getItem(CLAVE_VISTA); } catch { return; }
  try { localStorage.setItem(CLAVE_VISTA, VERSION); } catch { /* sin almacenamiento */ }
  if (!vista || vista === VERSION) return; // primera instalación o ya vista
  try {
    const v = await (await fetch('version.json', { cache: 'no-cache' })).json();
    if (v.version !== VERSION || !v.novedades?.length) return;
    sheet({
      title: `Novedades · versión ${VERSION}`,
      ico: 'checkCircle',
      tone: 'tone-ok',
      body: `<p class="small muted" style="margin-top:-6px">La app se actualizó${v.fecha ? ` (${esc(fdate(v.fecha))})` : ''}. Tus datos siguen intactos.</p>
        <div class="list menu">${v.novedades.map((n) => `<div class="item" style="cursor:default"><span class="ico tone-primary">${icon('check', 'sm')}</span><span class="grow">${esc(n)}</span></div>`).join('')}</div>
        <button class="btn primary block" data-close-nov>Entendido</button>`,
      onMount(el, api) {
        el.querySelector('[data-close-nov]').onclick = () => api.close();
      },
    });
  } catch { /* sin conexión: no pasa nada */ }
}
