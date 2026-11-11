// Menú "Más" y Ajustes: configuración, respaldo, seguridad.
import { icon } from '../icons.js';
import { $, esc, fdate, diffDays, today, parseNum } from '../utils.js';
import { sheet, toast, field, switchHtml, confirmDialog, pwField, bindPw, afterLayers } from '../ui.js';
import * as store from '../store.js';
import { exportBackup, pickBackupFile, pickMigrationFile } from '../backup.js';

const VERSION_APP = '1.0.0';

function infoRespaldo(cfg) {
  const u = cfg.ultimoRespaldo;
  if (!u) return 'Nunca';
  const d = diffDays(today(), u.slice(0, 10));
  return `${fdate(u.slice(0, 10))} (${d === 0 ? 'hoy' : `hace ${d} día${d > 1 ? 's' : ''}`})`;
}

export function mas(app) {
  const main = app.shell({ title: 'Más', tab: 'mas' });
  const s = app.state;
  main.innerHTML = `
    <div class="list menu">
      <a class="item" href="#/capital"><span class="ico tone-violet">${icon('bank')}</span><span class="grow"><span class="t">Capital y socios</span><br><span class="s">Aportes, retiros y capital disponible</span></span>${icon('next', 'sm')}</a>
      <a class="item" href="#/estadisticas"><span class="ico tone-info">${icon('chart')}</span><span class="grow"><span class="t">Estadísticas</span><br><span class="s">Gráficas, ganancias y proyecciones</span></span>${icon('next', 'sm')}</a>
    </div>
    <div class="section-title">Respaldo</div>
    <div class="list menu">
      <button class="item" data-o="exportar"><span class="ico tone-ok">${icon('download')}</span><span class="grow"><span class="t">Exportar respaldo</span><br><span class="s">Último: ${esc(infoRespaldo(s.config))}</span></span>${icon('next', 'sm')}</button>
      <button class="item" data-o="importar"><span class="ico tone-warn">${icon('upload')}</span><span class="grow"><span class="t">Importar respaldo</span><br><span class="s">Reemplaza los datos de este teléfono</span></span>${icon('next', 'sm')}</button>
      <button class="item" data-o="excel"><span class="ico tone-info">${icon('file')}</span><span class="grow"><span class="t">Importar desde Excel</span><br><span class="s">Archivo migracion-excel.json</span></span>${icon('next', 'sm')}</button>
    </div>
    <div class="section-title">Cuenta</div>
    <div class="list menu">
      <a class="item" href="#/ajustes"><span class="ico tone-primary">${icon('sliders')}</span><span class="grow t">Ajustes</span>${icon('next', 'sm')}</a>
      <button class="item" data-o="bloquear"><span class="ico tone-info">${icon('lock')}</span><span class="grow t">Bloquear ahora</span>${icon('next', 'sm')}</button>
    </div>
    <p class="tiny muted" style="text-align:center;margin-top:20px">Control de Cobros v${VERSION_APP} · ${s.clientes.length} clientes · ${s.prestamos.length} préstamos<br>Los datos se guardan cifrados solo en este teléfono.</p>`;
  main.addEventListener('click', (e) => {
    const o = e.target.closest('[data-o]')?.dataset.o;
    if (o === 'exportar') exportar(app);
    else if (o === 'importar') importar(app);
    else if (o === 'excel') importarExcel(app);
    else if (o === 'bloquear') app.lock();
  });
}

async function exportar(app) {
  try {
    const via = await exportBackup();
    if (via) toast(via === 'compartido' ? 'Respaldo compartido' : 'Respaldo descargado');
    app.refresh();
  } catch (e) {
    toast('No se pudo exportar: ' + e.message, 'err');
  }
}

async function importar(app) {
  let b;
  try { b = await pickBackupFile(); } catch (e) { return toast(e.message, 'err'); }
  if (!b) return;
  sheet({
    title: 'Importar respaldo',
    ico: 'upload',
    tone: 'tone-warn',
    body: `<div class="alert warn">${icon('alert')}<div class="grow small">Respaldo del <b>${esc(fdate(b.fecha.slice(0, 10)))}</b>. Todos los datos actuales de este teléfono se <b>reemplazarán</b>. Tu usuario y contraseña actuales se mantienen.</div></div>
      <form>${field('Usuario del respaldo', '<input name="usuario" autocomplete="off" autocapitalize="none" required>')}
      ${pwField('clave', 'Contraseña del respaldo')}
      <div class="err-msg"></div>
      <button class="btn primary block" type="submit">${icon('refresh', 'sm')} Reemplazar datos</button></form>`,
    onMount(el, api) {
      bindPw(el);
      const f = $('form', el);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = await store.openBackup(b, f.usuario.value, f.clave.value);
        if (!data) return ($('.err-msg', f).textContent = 'Usuario o contraseña incorrectos para este respaldo.');
        await store.replaceState(data);
        api.close();
        toast('Respaldo importado');
        app.go('#/inicio');
      };
    },
  });
}

async function importarExcel(app) {
  let m;
  try { m = await pickMigrationFile(); } catch (e) { return toast(e.message, 'err'); }
  if (!m) return;
  const r = m.reporte || {};
  const res = r.resumen || {};
  const lista = (arr) => (arr?.length ? `<ul class="small" style="margin:6px 0 0;padding-left:18px">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const s = app.state;
  const hayDatos = s.clientes.length || s.prestamos.length || s.socios.length;
  sheet({
    title: 'Importar desde Excel',
    ico: 'file',
    tone: 'tone-info',
    body: `<p class="small muted" style="margin-top:-6px">Archivo generado el ${esc(fdate(String(m.generado).slice(0, 10)))} desde “${esc(m.origen || 'Excel')}”.</p>
      <div class="summary">
        <div class="r"><span>Clientes</span><b>${res.clientes ?? m.datos.clientes.length}</b></div>
        <div class="r"><span>Préstamos activos</span><b>${res.prestamos_activos ?? '—'}</b></div>
        <div class="r"><span>Préstamos ya pagados (historial)</span><b>${res.prestamos_historial ?? '—'}</b></div>
        <div class="r"><span>Pagos registrados</span><b>${res.pagos ?? '—'}</b></div>
        <div class="r"><span>Socios</span><b>${res.socios ?? m.datos.socios.length}</b></div>
      </div>
      ${r.no_importado?.length ? `<div class="alert info">${icon('info')}<div class="grow small"><b>No se importa</b>${lista(r.no_importado)}</div></div>` : ''}
      ${r.avisos?.length ? `<details class="card flat small" style="padding:12px"><summary><b>${r.avisos.length} avisos para revisar</b></summary>${lista(r.avisos)}</details>` : ''}
      ${hayDatos ? `<div class="alert warn">${icon('alert')}<div class="grow small">Esta app ya tiene datos (${s.clientes.length} clientes, ${s.prestamos.length} préstamos). <b>Se reemplazarán</b> por los del Excel. Haz un respaldo antes si los necesitas.</div></div>` : ''}
      <button class="btn primary block" data-ok>${icon('upload', 'sm')} Importar</button>
      <p class="tiny muted" style="text-align:center">Después de importar, borra el archivo migracion-excel.json: no está cifrado.</p>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        if (hayDatos && !(await confirmDialog({ title: '¿Reemplazar los datos?', text: 'Los datos actuales se borrarán y quedarán los del Excel.', ok: 'Reemplazar', danger: true }))) return;
        await store.importMigration(m.datos);
        api.close();
        toast('Datos del Excel importados');
        app.go('#/inicio');
      };
    },
  });
}

export function render(app) {
  const s = app.state;
  const c = s.config;
  const main = app.shell({ title: 'Ajustes', back: '#/mas', tab: 'mas' });
  main.innerHTML = `
    <form class="card" data-cfg>
      <h3>Préstamos</h3>
      ${field('Nombre del negocio (sale en la tarjeta)', `<input name="negocio" value="${esc(c.negocio)}">`)}
      <div class="grid2">
        ${field('Interés por defecto (%)', `<input type="number" name="tasa" step="0.5" min="0" value="${c.tasa}">`)}
        ${field('Interés adicional (%)', `<input type="number" name="tasaAdicional" step="0.5" min="0" value="${c.tasaAdicional}">`)}
      </div>
      ${switchHtml('cobraDomingos', 'Cobrar domingos por defecto', c.cobraDomingos)}
      <div class="grid2">
        ${field('Alerta de mora (días)', `<input type="number" name="alertaMora" min="1" value="${c.alertaMora}">`)}
        ${field('Indicativo WhatsApp', `<input name="indicativo" inputmode="numeric" value="${esc(c.indicativo)}">`)}
      </div>
      <h3 style="margin-top:6px">Seguridad</h3>
      ${field('Bloquear tras inactividad', `<select name="bloqueoMin">${[[1, '1 minuto'], [3, '3 minutos'], [5, '5 minutos'], [10, '10 minutos'], [30, '30 minutos'], [0, 'Nunca']].map(([v, t]) => `<option value="${v}" ${+c.bloqueoMin === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
      <button class="btn primary block" type="submit">${icon('check', 'sm')} Guardar ajustes</button>
    </form>
    <div class="list menu">
      <button class="item" data-o="clave"><span class="ico tone-primary">${icon('shield')}</span><span class="grow t">Cambiar usuario o contraseña</span>${icon('next', 'sm')}</button>
      <button class="item" data-o="borrar"><span class="ico tone-danger">${icon('trash')}</span><span class="grow"><span class="t">Borrar todos los datos</span><br><span class="s">De este teléfono. No se puede deshacer.</span></span>${icon('next', 'sm')}</button>
    </div>`;
  const f = $('[data-cfg]', main);
  f.onsubmit = async (e) => {
    e.preventDefault();
    Object.assign(c, {
      negocio: f.negocio.value.trim() || 'Control de Cobros',
      tasa: parseNum(f.tasa.value),
      tasaAdicional: parseNum(f.tasaAdicional.value),
      cobraDomingos: f.cobraDomingos.checked,
      alertaMora: Math.max(1, parseInt(f.alertaMora.value, 10) || 5),
      indicativo: f.indicativo.value.replace(/\D/g, '') || '57',
      bloqueoMin: parseInt(f.bloqueoMin.value, 10) || 0,
    });
    await app.save();
    toast('Ajustes guardados');
  };
  main.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-o]')?.dataset.o;
    if (o === 'clave') cambiarClave();
    if (o === 'borrar') {
      if (!(await confirmDialog({ title: '¿Borrar todo?', text: 'Se eliminarán <b>todos</b> los clientes, préstamos y socios de este teléfono. Haz un respaldo antes si lo necesitas.', ok: 'Borrar todo', danger: true }))) return;
      if (!(await confirmDialog({ title: '¿Seguro?', text: 'Esta acción no se puede deshacer.', ok: 'Sí, borrar', danger: true }))) return;
      await store.wipeAll();
      location.hash = '';
      location.reload();
    }
  });
}

function cambiarClave() {
  sheet({
    title: 'Usuario y contraseña',
    ico: 'shield',
    body: `<form>
      ${field('Usuario actual', '<input name="u0" autocomplete="username" autocapitalize="none" required>')}
      ${pwField('c0', 'Contraseña actual')}
      ${field('Usuario nuevo', '<input name="u1" autocomplete="off" autocapitalize="none" required minlength="3">')}
      ${pwField('c1', 'Contraseña nueva', 'new-password')}
      ${pwField('c2', 'Repetir contraseña nueva', 'new-password')}
      <p class="small muted">Los respaldos que ya exportaste siguen abriéndose con el usuario y la contraseña anteriores.</p>
      <div class="err-msg"></div>
      <button class="btn primary block" type="submit">${icon('check', 'sm')} Cambiar</button></form>`,
    onMount(el, api) {
      bindPw(el);
      const f = $('form', el);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('.err-msg', f);
        if (f.u1.value.trim().length < 3) return (err.textContent = 'El usuario nuevo debe tener al menos 3 letras.');
        if (f.c1.value.length < 6) return (err.textContent = 'La contraseña nueva debe tener al menos 6 caracteres.');
        if (f.c1.value !== f.c2.value) return (err.textContent = 'Las contraseñas nuevas no coinciden.');
        const ok = await store.changeCredentials(f.u0.value, f.c0.value, f.u1.value, f.c1.value);
        if (!ok) return (err.textContent = 'El usuario o la contraseña actual no son correctos.');
        api.close();
        toast('Usuario y contraseña actualizados');
      };
    },
  });
}
