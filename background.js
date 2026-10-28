// Вся логика переключения живёт здесь, в service worker-е:
// даже если пользователь закроет попап в середине операции, работа продолжится.

import {
  INDEX_KEY, getIndex, getProfile, saveProfile, deleteProfile,
  getActiveId, setActiveId, countBookmarks,
} from './lib/store.js';
import { readBar, applyToBar, sameNodes } from './lib/bookmarks.js';

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) }),
  );
  return true; // ответ будет асинхронным
});

async function handle(msg) {
  switch (msg.type) {
    case 'getState': return getState();
    case 'switch': return switchTo(msg.id);
    case 'create': return createProfile(msg.name);
    case 'saveActive': return saveActive();
    case 'restoreActive': return restoreActive();
    case 'delete': return removeProfile(msg.id);
    case 'rename': return renameProfile(msg.id, msg.name);
    case 'export': return exportData();
    case 'import': return importData(msg.payload);
    default: throw new Error('Неизвестная команда: ' + msg.type);
  }
}

async function getState() {
  const [index, activeId] = await Promise.all([getIndex(), getActiveId()]);
  const profiles = Object.values(index.profiles)
    .map(({ id, name, count, updated }) => ({ id, name, count, updated }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  let barDiffers = null;
  let barCount = 0;
  const barNodes = await readBar();
  barCount = countBookmarks(barNodes);
  if (activeId && index.profiles[activeId]) {
    const active = await getProfile(activeId);
    barDiffers = active ? !sameNodes(barNodes, active.nodes) : null;
  }

  const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
  const used = await chrome.storage.sync.getBytesInUse(null);
  return { profiles, activeId: activeId && index.profiles[activeId] ? activeId : null, barDiffers, barCount, used, quota };
}

async function switchTo(id) {
  const index = await getIndex();
  const target = index.profiles[id];
  if (!target) throw new Error('Профиль не найден');

  const activeId = await getActiveId();
  if (!activeId || !index.profiles[activeId]) {
    throw new Error('Панель ещё не привязана к профилю. Сначала создайте профиль из текущей панели — иначе текущим закладкам будет некуда сохраниться.');
  }
  if (id === activeId) return { message: 'Этот профиль уже активен' };

  // Текущая панель — это правки пользователя с момента прошлого переключения:
  // фиксируем её в активный профиль ДО каких-либо изменений панели.
  // Если запись не удалась (например, квота), панель останется нетронутой.
  await saveProfile(activeId, index.profiles[activeId].name, await readBar());

  const profile = await getProfile(id);
  await applyToBar(profile.nodes);
  await setActiveId(id);
  await refreshBadge();
  return { message: `Включён профиль «${target.name}»` };
}

async function createProfile(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Введите название профиля');

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
  return { message: `Профиль «${trimmed}» создан из текущей панели` };
}

async function saveActive() {
  const [index, activeId] = await Promise.all([getIndex(), getActiveId()]);
  if (!activeId || !index.profiles[activeId]) throw new Error('Нет активного профиля');
  await saveProfile(activeId, index.profiles[activeId].name, await readBar());
  return { message: 'Текущая панель сохранена в профиль' };
}

async function restoreActive() {
  const activeId = await getActiveId();
  const profile = activeId ? await getProfile(activeId) : null;
  if (!profile) throw new Error('Нет активного профиля');
  await applyToBar(profile.nodes);
  return { message: 'Панель восстановлена из профиля' };
}

async function removeProfile(id) {
  await deleteProfile(id);
  if ((await getActiveId()) === id) {
    await setActiveId(null);
    await refreshBadge();
  }
  return { message: 'Профиль удалён. Содержимое панели не изменилось.' };
}

async function renameProfile(id, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Название не может быть пустым');
  const profile = await getProfile(id);
  if (!profile) throw new Error('Профиль не найден');
  await saveProfile(id, trimmed, profile.nodes);
  return { message: 'Профиль переименован' };
}

async function exportData() {
  const index = await getIndex();
  const out = [];
  for (const id of Object.keys(index.profiles)) {
    const profile = await getProfile(id);
    if (profile) out.push({ name: profile.name, nodes: profile.nodes });
  }
  return JSON.stringify({ app: 'bookmark-profiles', version: 1, exported: new Date().toISOString(), profiles: out }, null, 2);
}

async function importData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не похож на JSON');
  }
  const list = Array.isArray(data.profiles) ? data.profiles : [];
  let n = 0;
  for (const item of list) {
    if (!item || !Array.isArray(item.nodes)) continue;
    await saveProfile(crypto.randomUUID(), String(item.name || 'Импорт'), item.nodes);
    n++;
  }
  if (!n) throw new Error('В файле не нашлось профилей');
  return { message: `Импортировано профилей: ${n}` };
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
