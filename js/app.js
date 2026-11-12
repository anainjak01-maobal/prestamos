// Punto de entrada: arranque, acceso, navegación y bloqueo por inactividad.
import * as store from './store.js';
import { icon } from './icons.js';
import { esc } from './utils.js';
import { closeAllLayers, afterLayers, toast } from './ui.js';
import * as auth from './views/auth.js';
import * as inicio from './views/inicio.js';
import * as clientes from './views/clientes.js';
import * as prestamos from './views/prestamos.js';
import * as prestamo from './views/prestamo.js';
import * as estadisticas from './views/estadisticas.js';
import * as capital from './views/capital.js';
import * as ajustes from './views/ajustes.js';
import * as gastos from './views/gastos.js';
import * as cierre from './views/cierre.js';
import * as adicionales from './views/adicionales.js';
import * as informe from './views/informe.js';
import { buscarActualizacion, mostrarNovedadesSiCorresponde } from './update.js';

const root = document.getElementById('app');

const routes = [
  [/^\/?(inicio)?$/, inicio.render],
  [/^\/clientes$/, clientes.lista],
  [/^\/cliente\/([^/]+)$/, clientes.detalle],
  [/^\/prestamos$/, prestamos.lista],
  [/^\/prestamo\/([^/]+)$/, prestamo.detalle],
  [/^\/nuevo$/, prestamo.nuevo],
  [/^\/estadisticas$/, estadisticas.render],
  [/^\/mas$/, ajustes.mas],
  [/^\/capital$/, capital.lista],
  [/^\/socio\/([^/]+)$/, capital.socio],
  [/^\/ajustes$/, ajustes.render],
  [/^\/gastos$/, gastos.lista],
  [/^\/cierre$/, cierre.render],
  [/^\/adicionales$/, adicionales.render],
  [/^\/informe$/, informe.render],
];

const TABS = [
  ['inicio', '#/inicio', 'home', 'Inicio'],
  ['clientes', '#/clientes', 'users', 'Clientes'],
  ['prestamos', '#/prestamos', 'wallet', 'Préstamos'],
  ['estadisticas', '#/estadisticas', 'chart', 'Gráficas'],
  ['mas', '#/mas', 'grid', 'Más'],
];

let lastPath = null;

export const app = {
  /** Navega a una ruta (espera a que se cierren hojas abiertas). */
  go(hash) {
    afterLayers(() => {
      if (location.hash === hash) render();
      else location.hash = hash;
    });
  },
  refresh() { render(); },
  lock() { bloquear(); },
  get state() { return store.state; },
  save() { return store.save(); },
  /** Arma la pantalla: barra superior, contenido, barra de pestañas y botón flotante. Devuelve el <main>. */
  shell({ title, tab, back, actions = '', fab }) {
    root.innerHTML = `<div class="shell">
      <header class="topbar">
        ${back ? `<a class="icon-btn" href="${back}" aria-label="Volver">${icon('back')}</a>` : ''}
        <h1>${esc(title)}</h1>${actions}
      </header>
      <main class="view"></main>
      ${fab ? `<button class="fab" data-fab>${icon(fab.icon || 'plus')}${fab.label ? `<span>${esc(fab.label)}</span>` : ''}</button>` : ''}
      <nav class="tabbar">${TABS.map(([id, href, ic, txt]) => `<a href="${href}" class="${tab === id ? 'on' : ''}"><span class="pill">${icon(ic)}</span>${txt}</a>`).join('')}</nav>
    </div>`;
    if (fab) root.querySelector('[data-fab]').onclick = fab.onClick;
    return root.querySelector('main');
  },
};

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/inicio';
  const [path, qs] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function render() {
  if (!store.isUnlocked()) return;
  const { path, query } = parseHash();
  const y = window.scrollY;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try {
        fn(app, decodeURIComponent(m[1] || ''), query);
      } catch (e) {
        console.error(e);
        toast('Error: ' + e.message, 'err');
      }
      window.scrollTo(0, path === lastPath ? y : 0);
      lastPath = path;
      return;
    }
  }
  app.go('#/inicio');
}

window.addEventListener('hashchange', render);

// ---- Bloqueo por inactividad ----
let ultimaActividad = Date.now();
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, () => (ultimaActividad = Date.now()), { passive: true }));
function revisarBloqueo() {
  if (!store.isUnlocked()) return;
  const min = Number(store.state.config.bloqueoMin) || 0;
  if (min > 0 && Date.now() - ultimaActividad > min * 60000) bloquear();
}
setInterval(revisarBloqueo, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    revisarBloqueo();
    buscarActualizacion();
  }
});
// Revisa si hay versión nueva cada 30 minutos mientras la app está abierta.
setInterval(() => buscarActualizacion(), 30 * 60000);

export function bloquear() {
  closeAllLayers();
  store.lock();
  lastPath = null;
  auth.renderLogin(root, entrar);
}

function entrar() {
  ultimaActividad = Date.now();
  lastPath = null;
  render();
  mostrarNovedadesSiCorresponde();
}

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
  if (!window.crypto?.subtle) {
    root.innerHTML = '<div class="auth"><div class="box card"><h3>Conexión no segura</h3><p class="muted">Abre la app desde su dirección https (GitHub Pages) para poder usarla.</p></div></div>';
    return;
  }
  if (await store.hasAccount()) auth.renderLogin(root, entrar);
  else auth.renderSetup(root, entrar);
  buscarActualizacion();
}

boot();
