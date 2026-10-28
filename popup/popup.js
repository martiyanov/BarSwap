// Попап — только отображение и кнопки. Вся логика в background.js,
// поэтому закрытие попапа в середине операции ничего не ломает.
// Тексты — из _locales (chrome.i18n): английский и русский.

import { applyI18n } from '../lib/i18n-dom.js';

const $ = (id) => document.getElementById(id);
const msg = (key, subs) => chrome.i18n.getMessage(key, subs);

const state = { data: null, busy: false, armed: {}, renameId: null };

init();

async function init() {
  applyI18n();
  $('help').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  });
  $('createBtn').addEventListener('click', onCreate);
  $('newName').addEventListener('keydown', (e) => { if (e.key === 'Enter') onCreate(); });
  $('exportBtn').addEventListener('click', onExport);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', onImport);

  chrome.storage.onChanged.addListener((_changes, area) => {
    // Пришло обновление синхронизации — обновляем список, но не мешаем
    // редактированию (переименование внутри списка).
    if (area !== 'sync') return;
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.closest('.list')) return;
    refresh();
  });

  await refresh();
}

async function call(type, extra = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...extra });
  if (!res || !res.ok) throw new Error((res && res.error) || msg('errNoResponse'));
  return res.result;
}

async function refresh() {
  try {
    state.data = await call('getState');
  } catch (e) {
    flash(e.message, true);
    return;
  }
  render();
}

async function act(type, extra = {}) {
  if (state.busy) return;
  setBusy(true);
  try {
    const res = await call(type, extra);
    if (res && res.message) flash(res.message);
    state.data = await call('getState');
    render();
  } catch (e) {
    flash(e.message, true);
  } finally {
    setBusy(false);
  }
}

function render() {
  const d = state.data;
  if (!d) return;
  renderStatus(d);
  renderList(d);
  renderBackups(d);
  renderUsage(d);
}

function renderStatus(d) {
  const el = $('status');
  el.textContent = '';

  if (!d.profiles.length) {
    const hint = div('hint');
    hint.textContent = msg('hintFirst');
    el.appendChild(hint);
    return;
  }

  if (!d.activeId) {
    const hint = div('hint warn');
    hint.textContent = msg('hintUnbound');
    el.appendChild(hint);
    return;
  }

  const active = d.profiles.find((p) => p.id === d.activeId);
  const line = div('active-line');
  line.append(msg('activeLabel') + ' ');
  const b = document.createElement('b');
  b.textContent = active ? active.name : '—';
  line.appendChild(b);
  el.appendChild(line);

  if (d.barDiffers) {
    const box = div('diff');
    const text = span('diff-text');
    text.textContent = msg('diffText');
    const save = button('primary', msg('diffSaveBtn'));
    const restore = button('danger', msg('diffRestoreBtn'));
    restore.title = msg('diffRestoreTitle');
    save.addEventListener('click', () => act('saveActive'));
    restore.addEventListener('click', () => arm('restore', restore, () => act('restoreActive')));
    box.append(text, save, restore);
    el.appendChild(box);
  }
}

function renderList(d) {
  const list = $('list');
  list.textContent = '';

  for (const p of d.profiles) {
    const li = document.createElement('li');
    li.className = 'row' + (p.id === d.activeId ? ' active' : '');

    if (state.renameId === p.id) {
      const input = document.createElement('input');
      input.className = 'rename-input';
      input.value = p.name;
      input.maxLength = 60;
      let done = false;
      const save = () => {
        if (done) return;
        done = true;
        const value = input.value.trim();
        state.renameId = null;
        if (value && value !== p.name) act('rename', { id: p.id, name: value });
        else render();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { done = true; state.renameId = null; render(); }
      });
      input.addEventListener('blur', save);
      li.appendChild(input);
    } else {
      const main = button('main');
      const nameEl = span('name');
      nameEl.textContent = p.name;
      const metaEl = span('meta');
      metaEl.textContent = msg('metaLine', [String(p.count), fmtDate(p.updated)]);
      main.title = p.id === d.activeId ? msg('activeRowTitle') : msg('switchRowTitle');
      main.append(nameEl, metaEl);
      main.addEventListener('click', () => { if (p.id !== d.activeId) act('switch', { id: p.id }); });

      const renameBtn = button('icon');
      renameBtn.textContent = '✎';
      renameBtn.title = msg('renameTitle');
      renameBtn.addEventListener('click', () => {
        state.renameId = p.id;
        render();
        const input = li.querySelector('input');
        if (input) { input.focus(); input.select(); }
      });

      const delBtn = button('icon del');
      delBtn.textContent = '🗑';
      delBtn.title = msg('deleteTitle');
      delBtn.addEventListener('click', () => arm('del:' + p.id, delBtn, () => act('delete', { id: p.id })));

      li.append(main, renameBtn, delBtn);
    }
    list.appendChild(li);
  }
}

function renderBackups(d) {
  const box = $('backups');
  box.textContent = '';
  if (!d.backups || !d.backups.length) return;

  const h = document.createElement('h2');
  h.textContent = msg('backupsTitle');
  const note = div('note');
  note.textContent = msg('backupsNote');
  box.append(h, note);

  for (const b of d.backups) {
    const li = document.createElement('div');
    li.className = 'row';

    const main = button('main');
    const nameEl = span('name');
    nameEl.textContent = b.label;
    const metaEl = span('meta');
    metaEl.textContent = msg('backupMeta', [String(b.barCount), fmtDateTime(b.ts)]);
    main.append(nameEl, metaEl);
    main.title = b.hasProfileBefore
      ? msg('backupRestoreBtn') + ' — ' + msg('backupsTitle')
      : msg('backupRestoreBtn');

    const restoreBtn = button('primary', msg('backupRestoreBtn'));
    restoreBtn.addEventListener('click', () => arm('bk:' + b.id, restoreBtn, () => act('restoreBackup', { id: b.id })));
    li.append(main, restoreBtn);
    box.appendChild(li);
  }
}

function renderUsage(d) {
  const el = $('usage');
  const kb = Math.max(0, Math.round(d.used / 1024));
  const quotaKb = Math.round(d.quota / 1024);
  el.textContent = msg('usageLine', [String(kb), String(quotaKb)]);
  el.classList.toggle('warn', d.used > d.quota * 0.9);
}

async function onCreate() {
  const input = $('newName');
  const name = input.value.trim();
  if (!name) {
    flash(msg('errEnterName'), true);
    input.focus();
    return;
  }
  await act('create', { name });
  input.value = '';
}

async function onExport() {
  try {
    const json = await call('export');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'barswap-profiles.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    flash(msg('msgExported'));
  } catch (e) {
    flash(e.message, true);
  }
}

async function onImport(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await act('import', { payload: await file.text() });
  } catch (err) {
    flash(msg('errImport', [err.message]), true);
  }
}

// Двухшаговое подтверждение опасных действий: первый клик «взводит» кнопку,
// второй в течение 3 секунд — выполняет.
function arm(key, el, fn) {
  const now = Date.now();
  if (state.armed[key] && now - state.armed[key] < 3000) {
    delete state.armed[key];
    el.classList.remove('armed');
    fn();
  } else {
    state.armed[key] = now;
    el.classList.add('armed');
    el.title = msg('armTitle');
    setTimeout(() => {
      if (state.armed[key] === now) delete state.armed[key];
      el.classList.remove('armed');
    }, 3000);
  }
}

function setBusy(v) {
  state.busy = v;
  document.body.classList.toggle('busy', v);
}

let flashTimer = 0;
function flash(text, isErr = false) {
  const el = $('flash');
  el.textContent = text;
  el.className = 'flash show' + (isErr ? ' err' : '');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(chrome.i18n.getUILanguage(), { day: 'numeric', month: 'short' });
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(chrome.i18n.getUILanguage(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function div(className) {
  const el = document.createElement('div');
  if (className) el.className = className;
  return el;
}

function span(className) {
  const el = document.createElement('span');
  if (className) el.className = className;
  return el;
}

function button(className, label) {
  const el = document.createElement('button');
  if (className) el.className = className;
  if (label !== undefined) el.textContent = label;
  return el;
}
