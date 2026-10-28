// Хранилище профилей закладок.
//
// Профили лежат в chrome.storage.sync — они синхронизируются вместе с аккаунтом
// Google и потому доступны на всех компьютерах. Активный профиль хранится
// в chrome.storage.local — он у каждого компьютера свой.
//
// У sync-хранилища есть лимит на размер одного ключа (8 КБ), поэтому большой
// профиль режется на несколько ключей-кусков, и общий лимит ~100 КБ, поэтому
// содержимое сжимается (LZ-сжатие, формат v2; v1 — несжатый JSON старых версий).

import LZString from './lz-string.js';

export const INDEX_KEY = 'profilesIndex';
const CHUNK_PREFIX = 'p:';
const FORMAT_VERSION = 2;
// Консервативный лимит на кусок: меньше 8 КБ при любом способе подсчёта байтов
// (до 3 байтов UTF-8 на символ, до 2 байтов UTF-16).
const MAX_CHUNK_BYTES = 2600;

export async function getIndex() {
  const data = await chrome.storage.sync.get(INDEX_KEY);
  return data[INDEX_KEY] || { profiles: {} };
}

// Возвращает { id, name, count, updated, chunks, nodes } или null.
export async function getProfile(id) {
  const index = await getIndex();
  const meta = index.profiles[id];
  if (!meta) return null;
  const keys = [];
  for (let i = 0; i < meta.chunks; i++) keys.push(chunkKey(id, i));
  const data = await chrome.storage.sync.get(keys);
  let raw = '';
  for (const k of keys) raw += data[k] || '';
  if (!raw) return null;
  const json = meta.v === FORMAT_VERSION ? LZString.decompressFromUTF16(raw) : raw;
  if (!json) return null;
  return { ...meta, nodes: JSON.parse(json) };
}

export async function saveProfile(id, name, nodes) {
  const chunks = chunkString(LZString.compressToUTF16(JSON.stringify(nodes)), MAX_CHUNK_BYTES);
  const payload = {};
  chunks.forEach((chunk, i) => { payload[chunkKey(id, i)] = chunk; });
  await chrome.storage.sync.set(payload);

  const index = await getIndex();
  const oldChunks = index.profiles[id] ? index.profiles[id].chunks : 0;
  if (oldChunks > chunks.length) {
    const stale = [];
    for (let i = chunks.length; i < oldChunks; i++) stale.push(chunkKey(id, i));
    await chrome.storage.sync.remove(stale);
  }

  index.profiles[id] = {
    id,
    name,
    chunks: chunks.length,
    count: countBookmarks(nodes),
    updated: Date.now(),
    v: FORMAT_VERSION,
  };
  await chrome.storage.sync.set({ [INDEX_KEY]: index });
  return index.profiles[id];
}

export async function deleteProfile(id) {
  const index = await getIndex();
  const meta = index.profiles[id];
  if (!meta) return;
  const keys = [];
  for (let i = 0; i < meta.chunks; i++) keys.push(chunkKey(id, i));
  await chrome.storage.sync.remove(keys);
  delete index.profiles[id];
  await chrome.storage.sync.set({ [INDEX_KEY]: index });
}

export async function getActiveId() {
  const data = await chrome.storage.local.get('activeProfileId');
  return data.activeProfileId ?? null;
}

export async function setActiveId(id) {
  if (id) await chrome.storage.local.set({ activeProfileId: id });
  else await chrome.storage.local.remove('activeProfileId');
}

export function countBookmarks(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (node.u) n++;
    else n += countBookmarks(node.c || []);
  }
  return n;
}

function chunkKey(id, i) {
  return CHUNK_PREFIX + id + ':' + i;
}

// Режет строку на куски не длиннее maxBytes байтов (UTF-8).
// Итерация по кодовым точкам не разрывает суррогатные пары,
// склейка кусков через '' восстанавливает строку точно.
function chunkString(str, maxBytes) {
  const enc = new TextEncoder();
  const chunks = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of str) {
    const bytes = enc.encode(ch).length;
    if (currentBytes + bytes > maxBytes && current) {
      chunks.push(current);
      current = ch;
      currentBytes = bytes;
    } else {
      current += ch;
      currentBytes += bytes;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
