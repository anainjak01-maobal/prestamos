// Pantallas de acceso: crear cuenta, ingresar y restaurar respaldo en un teléfono nuevo.
import * as store from '../store.js';
import { icon } from '../icons.js';
import { $, esc, fdate } from '../utils.js';
import { field, pwField, bindPw, confirmDialog, toast } from '../ui.js';
import { pickBackupFile } from '../backup.js';

const logo = (sub) => `<div class="logo"><img src="icons/icon-192.png" alt=""><h1>Control de Cobros</h1><p>${sub}</p></div>`;

function busy(btn, on, txt) {
  btn.disabled = on;
  if (on) { btn.dataset.txt = btn.innerHTML; btn.innerHTML = txt || 'Un momento…'; }
  else if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt;
}

export function renderSetup(root, onDone) {
  root.innerHTML = `<div class="auth"><div class="box">
    ${logo('Préstamos, cobros y ganancias en tu bolsillo')}
    <div class="tabs"><button class="on" data-t="crear">Crear cuenta</button><button data-t="restaurar">Restaurar respaldo</button></div>
    <form class="card" id="f-crear" autocomplete="on">
      ${field('Usuario', '<input name="usuario" autocomplete="username" required minlength="3" autocapitalize="none">')}
      ${pwField('clave', 'Contraseña', 'new-password')}
      ${pwField('clave2', 'Repetir contraseña', 'new-password')}
      <div class="alert warn">${icon('alert')}<div class="grow small"><b>Guárdala bien.</b> Tus datos quedan cifrados con esta contraseña. Si la olvidas, solo podrás recuperarlos con un respaldo y su contraseña.</div></div>
      <div class="err-msg"></div>
      <button class="btn primary block" type="submit">${icon('shield', 'sm')} Crear cuenta</button>
    </form>
    <form class="card hidden" id="f-restaurar">
      <p class="small muted" style="margin-top:0">¿Perdiste o cambiaste de teléfono? Elige el último archivo de respaldo que exportaste e ingresa el usuario y la contraseña con que se hizo.</p>
      <button type="button" class="btn block" data-pick>${icon('upload', 'sm')} Elegir archivo de respaldo</button>
      <p class="small" data-file style="min-height:20px"></p>
      ${field('Usuario', '<input name="usuario" autocomplete="username" required autocapitalize="none">')}
      ${pwField('clave', 'Contraseña')}
      <div class="err-msg"></div>
      <button class="btn primary block" type="submit">${icon('refresh', 'sm')} Restaurar</button>
    </form>
  </div></div>`;
  bindPw(root);
  const fc = $('#f-crear', root), fr = $('#f-restaurar', root);
  root.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      fc.classList.toggle('hidden', b.dataset.t !== 'crear');
      fr.classList.toggle('hidden', b.dataset.t !== 'restaurar');
    };
  });

  fc.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.err-msg', fc);
    const u = fc.usuario.value.trim(), c1 = fc.clave.value, c2 = fc.clave2.value;
    if (u.length < 3) return (err.textContent = 'El usuario debe tener al menos 3 letras.');
    if (c1.length < 6) return (err.textContent = 'La contraseña debe tener al menos 6 caracteres.');
    if (c1 !== c2) return (err.textContent = 'Las contraseñas no coinciden.');
    const btn = fc.querySelector('[type=submit]');
    busy(btn, true, 'Creando…');
    try {
      await store.createAccount(u, c1);
      onDone();
    } catch (ex) {
      err.textContent = 'No se pudo crear la cuenta: ' + ex.message;
      busy(btn, false);
    }
  };

  let backup = null;
  $('[data-pick]', fr).onclick = async () => {
    try {
      backup = await pickBackupFile();
      if (backup) $('[data-file]', fr).innerHTML = `${icon('file', 'sm')} Respaldo del <b>${esc(fdate(backup.fecha.slice(0, 10)))}</b>`;
    } catch (ex) {
      $('.err-msg', fr).textContent = ex.message;
    }
  };
  fr.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.err-msg', fr);
    if (!backup) return (err.textContent = 'Primero elige el archivo de respaldo.');
    const btn = fr.querySelector('[type=submit]');
    busy(btn, true, 'Restaurando…');
    const ok = await store.restoreOnNewDevice(backup, fr.usuario.value, fr.clave.value);
    if (!ok) {
      busy(btn, false);
      return (err.textContent = 'Usuario o contraseña incorrectos para este respaldo.');
    }
    toast('Respaldo restaurado');
    onDone();
  };
}

export function renderLogin(root, onDone) {
  root.innerHTML = `<div class="auth"><div class="box">
    ${logo('Ingresa para continuar')}
    <form class="card" id="f-login" autocomplete="on">
      ${field('Usuario', '<input name="usuario" autocomplete="username" required autocapitalize="none">')}
      ${pwField('clave', 'Contraseña')}
      <div class="err-msg"></div>
      <button class="btn primary block" type="submit">${icon('lock', 'sm')} Ingresar</button>
    </form>
    <div style="text-align:center"><button class="btn ghost sm" data-opciones>¿Problemas para ingresar?</button></div>
    <div class="card hidden" data-panel>
      <p class="small muted" style="margin-top:0">Si olvidaste la contraseña, puedes reemplazar los datos de este teléfono por un respaldo (necesitas el usuario y la contraseña de ese respaldo).</p>
      <button class="btn block" data-restaurar>${icon('upload', 'sm')} Restaurar desde respaldo</button>
      <div style="height:10px"></div>
      <button class="btn danger block" data-borrar>${icon('trash', 'sm')} Borrar los datos de este teléfono</button>
    </div>
  </div></div>`;
  bindPw(root);
  const f = $('#f-login', root);
  setTimeout(() => f.usuario.focus(), 50);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    busy(btn, true, 'Verificando…');
    const ok = await store.login(f.usuario.value, f.clave.value);
    if (!ok) {
      busy(btn, false);
      $('.err-msg', f).textContent = 'Usuario o contraseña incorrectos.';
      f.clave.select();
      return;
    }
    onDone();
  };
  $('[data-opciones]', root).onclick = () => $('[data-panel]', root).classList.toggle('hidden');
  $('[data-restaurar]', root).onclick = async () => {
    let b;
    try { b = await pickBackupFile(); } catch (ex) { return toast(ex.message, 'err'); }
    if (!b) return;
    if (!(await confirmDialog({ title: 'Reemplazar datos', text: 'Los datos actuales de este teléfono se reemplazarán por los del respaldo. ¿Continuar?', ok: 'Continuar', danger: true }))) return;
    renderRestoreCreds(root, b, onDone);
  };
  $('[data-borrar]', root).onclick = async () => {
    if (!(await confirmDialog({ title: '¿Borrar todo?', text: 'Se eliminarán <b>todos</b> los datos de este teléfono. No se puede deshacer. Asegúrate de tener un respaldo.', ok: 'Borrar todo', danger: true }))) return;
    await store.wipeAll();
    location.reload();
  };
}

function renderRestoreCreds(root, backup, onDone) {
  root.innerHTML = `<div class="auth"><div class="box">
    ${logo(`Respaldo del ${esc(fdate(backup.fecha.slice(0, 10)))}`)}
    <form class="card">
      ${field('Usuario del respaldo', '<input name="usuario" autocomplete="username" required autocapitalize="none">')}
      ${pwField('clave', 'Contraseña del respaldo')}
      <div class="err-msg"></div>
      <button class="btn primary block" type="submit">${icon('refresh', 'sm')} Restaurar</button>
    </form>
    <div style="text-align:center"><button class="btn ghost sm" data-cancel>Cancelar</button></div>
  </div></div>`;
  bindPw(root);
  const f = root.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    busy(btn, true, 'Restaurando…');
    const data = await store.openBackup(backup, f.usuario.value, f.clave.value);
    if (!data) {
      busy(btn, false);
      return ($('.err-msg', f).textContent = 'Usuario o contraseña incorrectos para este respaldo.');
    }
    await store.wipeAll();
    await store.createAccount(f.usuario.value, f.clave.value, data);
    toast('Respaldo restaurado');
    onDone();
  };
  $('[data-cancel]', root).onclick = () => renderLogin(root, onDone);
}
