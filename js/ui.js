// Componentes de interfaz: hojas inferiores, diálogos, avisos y campos de formulario.
import { icon } from './icons.js';
import { esc, $, $$, moneyInput, num } from './utils.js';

const overlayRoot = () => document.getElementById('overlay-root');

// ---- Avisos (toast) ----
export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'err' ? 'alert' : 'checkCircle', 'sm')}<span>${esc(msg)}</span>`;
  root.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ---- Pila de capas: el botón "atrás" del teléfono cierra la hoja abierta ----
const capas = [];
let backsPendientes = 0;
let colaDespues = [];
window.addEventListener('popstate', () => {
  if (backsPendientes > 0) {
    // "atrás" lanzado por nosotros al cerrar una capa con su botón
    backsPendientes--;
    if (backsPendientes === 0) {
      const q = colaDespues;
      colaDespues = [];
      q.forEach((fn) => fn());
    }
    return;
  }
  const top = capas.pop();
  if (top) top.close(true);
});
function pushCapa(c) {
  capas.push(c);
  history.pushState({ capa: capas.length }, '');
}
function popCapa(c, fromPop) {
  const i = capas.indexOf(c);
  if (i >= 0) {
    capas.splice(i, 1);
    if (!fromPop) {
      backsPendientes++;
      history.back();
    }
  }
}
/** Ejecuta fn cuando terminen de cerrarse las capas (para navegar sin que el "atrás" lo deshaga). */
export function afterLayers(fn) {
  if (backsPendientes > 0) colaDespues.push(fn);
  else fn();
}
export function closeAllLayers() {
  while (capas.length) capas.pop().close(true);
}

// ---- Hoja inferior ----
export function sheet({ title, ico = 'info', tone = 'tone-primary', body = '', onMount }) {
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="grab"></div>
    <div class="sheet-head"><div class="ico ${tone}">${icon(ico)}</div><h2>${esc(title)}</h2>
    <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="sheet-body">${body}</div>`;
  overlayRoot().append(bd, el);
  let closed = false;
  const api = {
    el,
    close(fromPop = false) {
      if (closed) return;
      closed = true;
      popCapa(api, fromPop);
      el.classList.remove('show');
      bd.classList.remove('show');
      setTimeout(() => { el.remove(); bd.remove(); }, 260);
    },
  };
  bd.addEventListener('click', () => api.close());
  el.querySelector('[data-close]').addEventListener('click', () => api.close());
  pushCapa(api);
  requestAnimationFrame(() => { el.classList.add('show'); bd.classList.add('show'); });
  $$('input.money', el).forEach(moneyInput);
  bindSegs(el);
  onMount?.(el, api);
  return api;
}

// ---- Diálogo de confirmación ----
export function confirmDialog({ title, text = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'backdrop top';
    const el = document.createElement('div');
    el.className = 'dialog';
    el.innerHTML = `<h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
      <div class="btn-row"><button class="btn" data-no>${esc(cancel)}</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button></div>`;
    overlayRoot().append(bd, el);
    let done = false;
    const api = {
      close(fromPop = false, val = false) {
        if (done) return;
        done = true;
        popCapa(api, fromPop);
        el.classList.remove('show');
        bd.classList.remove('show');
        setTimeout(() => { el.remove(); bd.remove(); }, 200);
        resolve(val);
      },
    };
    pushCapa(api);
    requestAnimationFrame(() => { el.classList.add('show'); bd.classList.add('show'); });
    el.querySelector('[data-no]').onclick = () => api.close(false, false);
    el.querySelector('[data-yes]').onclick = () => api.close(false, true);
    bd.onclick = () => api.close(false, false);
  });
}

// ---- Pantalla completa (mostrar tarjeta al cliente) ----
export function fullscreen(html) {
  const el = document.createElement('div');
  el.className = 'fullscreen';
  el.innerHTML = `<button class="close" aria-label="Cerrar">${icon('x')}</button>${html}`;
  overlayRoot().append(el);
  let closed = false;
  const api = {
    el,
    close(fromPop = false) {
      if (closed) return;
      closed = true;
      popCapa(api, fromPop);
      el.remove();
    },
  };
  el.querySelector('.close').onclick = () => api.close();
  pushCapa(api);
  return api;
}

// ---- Campos ----
export const field = (label, input, hint = '') =>
  `<div class="field"><label>${esc(label)}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;

export const moneyField = (name, label, value = '', hint = '', attrs = '') =>
  field(label, `<input class="money money-input" name="${name}" value="${value ? num(value) : ''}" placeholder="$ 0" ${attrs}>`, hint);

export function segHtml(name, options, value, cls = '') {
  return `<div class="seg ${cls}" data-seg="${name}" data-value="${esc(value)}">${options
    .map((o) => `<button type="button" data-v="${esc(o)}" class="${o === value ? 'on' : ''}">${esc(o)}</button>`)
    .join('')}</div>`;
}
export function bindSegs(root) {
  $$('[data-seg]', root).forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      seg.dataset.value = b.dataset.v;
      seg.dispatchEvent(new CustomEvent('change', { bubbles: true }));
    });
  });
}
export const segValue = (root, name) => $(`[data-seg="${name}"]`, root)?.dataset.value;

export const switchHtml = (name, label, checked, sub = '') => `<label class="switch-row">
  <span><span class="t">${esc(label)}</span>${sub ? `<br><span class="small muted">${esc(sub)}</span>` : ''}</span>
  <span class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></span></label>`;

export function emptyState(ico, title, text = '', action = '') {
  return `<div class="empty"><div class="ico">${icon(ico, 'lg')}</div><h4>${esc(title)}</h4><p class="small">${text}</p>${action}</div>`;
}

export function badge(txt, cls) {
  return `<span class="badge ${cls}">${esc(txt)}</span>`;
}

export function pwField(name, label, autocomplete = 'current-password') {
  return field(label, `<div class="pw-wrap"><input type="password" name="${name}" autocomplete="${autocomplete}" required>
    <button type="button" class="icon-btn" data-pw aria-label="Ver contraseña">${icon('eye', 'sm')}</button></div>`);
}
export function bindPw(root) {
  $$('[data-pw]', root).forEach((b) => {
    b.onclick = () => {
      const inp = b.previousElementSibling;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      b.innerHTML = icon(inp.type === 'password' ? 'eye' : 'eyeOff', 'sm');
    };
  });
}
