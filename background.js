// Вся логика переключения живёт здесь, в service worker-е:
// даже если пользователь закроет попап в середине операции, работа продолжится.
// Тексты — из _locales (chrome.i18n): английский и русский.

import {
  INDEX_KEY, getIndex, getProfile, saveProfile, deleteProfile,
  getActiveId, setActiveId, countBookmarks,
} from './lib/store.js';
import { readBar, applyToBar, sameNodes } from './lib/bookmarks.js';

const msg = (key, subs) => chrome.i18n.getMessage(key, subs);

chrome.runtime.onInstalled.addListener(async (details) => {
  await refreshBadge();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.runtime.onStartup.addListener(refreshBadge);

// Бейдж иконки — первая буква активного профиля (у каждой машины своя).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[INDEX_KEY]) refreshBadge();
  if (area === 'local' && changes.activeProfileId) refreshBadge();
});

chrome.runtime.onMessage.addListener((msgObj, _sender, sendResponse) => {
  handle(msgObj).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => {
      const raw = String((err && err.message) || err);
      const error = /quota/i.test(raw) ? chrome.i18n.getMessage('errQuota') : raw;
      sendResponse({ ok: false, error });
    },
  );
  return true; // ответ будет асинхронным
});

async function handle(m) {
  switch (m.type) {
    case 'getState': return getState();
    case 'switch': return switchTo(m.id);
    case 'create': return createProfile(m.name);
    case 'saveActive': return saveActive();
    case 'restoreActive': return restoreActive();
    case 'delete': return removeProfile(m.id);
    case 'rename': return renameProfile(m.id, m.name);
    case 'export': return exportData();
    case 'import': return importData(m.payload);
    default: throw new Error(msg('errUnknownCommand', [m.type]));
  }
}

async function getState() {
  const [index, activeId] = await Promise.all([getIndex(), getActiveId()]);
  const profiles = Object.values(index.profiles)
    .map(({ id, name, count, updated }) => ({ id, name, count, updated }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  let barDiffers = null;
  const barNodes = await readBar();
  if (activeId && index.profiles[activeId]) {
    const active = await getProfile(activeId);
    barDiffers = active ? !sameNodes(barNodes, active.nodes) : null;
  }

  const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
  const used = await chrome.storage.sync.getBytesInUse(null);
  return { profiles, activeId: activeId && index.profiles[activeId] ? activeId : null, barDiffers, used, quota };
}

async function switchTo(id) {
  const index = await getIndex();
  const target = index.profiles[id];
  if (!target) throw new Error(msg('errProfileNotFound'));

  const activeId = await getActiveId();
  if (!activeId || !index.profiles[activeId]) {
    throw new Error(msg('errNotBound'));
  }
  if (id === activeId) return { message: msg('msgAlreadyActive') };

  // Текущая панель — это правки пользователя с момента прошлого переключения:
  // фиксируем её в активный профиль ДО каких-либо изменений панели.
  // Если запись не удалась (например, квота), панель останется нетронутой.
  await saveProfile(activeId, index.profiles[activeId].name, await readBar());

  const profile = await getProfile(id);
  await applyToBar(profile.nodes);
  await setActiveId(id);
  await refreshBadge();
  return { message: msg('msgSwitched', [target.name]) };
}

async function createProfile(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error(msg('errEnterName'));

  const nodes = await readBar();
  const index = await getIndex();
  const activeId = await getActiveId();
  if (activeId && index.profiles[activeId]) {
    // Панель переходит новому профилю; прежний фиксируем как есть.
    await saveProfile(activeId, index.profiles[activeId].name, nodes);
  }

  const id = crypto.randomUUID();
  await saveProfile(id, trimmed, nodes);
  await setActiveId(id);
  await refreshBadge();
  return { message: msg('msgCreated', [trimmed]) };
}

async function saveActive() {
  const [index, activeId] = await Promise.all([getIndex(), getActiveId()]);
  if (!activeId || !index.profiles[activeId]) throw new Error(msg('errNoActiveProfile'));
  await saveProfile(activeId, index.profiles[activeId].name, await readBar());
  return { message: msg('msgSavedBar') };
}

async function restoreActive() {
  const activeId = await getActiveId();
  const profile = activeId ? await getProfile(activeId) : null;
  if (!profile) throw new Error(msg('errNoActiveProfile'));
  await applyToBar(profile.nodes);
  return { message: msg('msgRestoredBar') };
}

async function removeProfile(id) {
  await deleteProfile(id);
  if ((await getActiveId()) === id) {
    await setActiveId(null);
    await refreshBadge();
  }
  return { message: msg('msgDeleted') };
}

async function renameProfile(id, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error(msg('errNameEmpty'));
  const profile = await getProfile(id);
  if (!profile) throw new Error(msg('errProfileNotFound'));
  await saveProfile(id, trimmed, profile.nodes);
  return { message: msg('msgRenamed') };
}

async function exportData() {
  const index = await getIndex();
  const out = [];
  for (const id of Object.keys(index.profiles)) {
    const profile = await getProfile(id);
    if (profile) out.push({ name: profile.name, nodes: profile.nodes });
  }
  return JSON.stringify({ app: 'barswap', version: 1, exported: new Date().toISOString(), profiles: out }, null, 2);
}

async function importData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(msg('errBadJson'));
  }
  const list = Array.isArray(data.profiles) ? data.profiles : [];
  let n = 0;
  for (const item of list) {
    if (!item || !Array.isArray(item.nodes)) continue;
    await saveProfile(crypto.randomUUID(), String(item.name || 'Import'), item.nodes);
    n++;
  }
  if (!n) throw new Error(msg('errNoProfilesInFile'));
  return { message: msg('msgImported', [String(n)]) };
}

async function refreshBadge() {
  try {
    const [index, activeId] = await Promise.all([getIndex(), getActiveId()]);
    const meta = activeId ? index.profiles[activeId] : null;
    const letter = meta ? ([...meta.name.trim()][0] || '•') : '';
    await chrome.action.setBadgeText({ text: letter.toUpperCase() });
    if (letter) await chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' });
  } catch {
    // бейдж не критичен
  }
}
