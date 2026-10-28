// Локальные резервные копии панели закладок.
// Перед каждой операцией, заменяющей панель (переключение профиля,
// восстановление), текущее состояние панели автоматически сохраняется сюда.
// Копии живут только на этом компьютере (chrome.storage.local) и не
// синхронизируются; хранятся последние MAX_BACKUPS штук.

import LZString from './lz-string.js';
import { countBookmarks } from './store.js';

const KEY = 'barBackups';
const MAX_BACKUPS = 10;

// record: { label, barNodes, profileBefore?: { id, name, nodes } }
export async function pushBackup(record) {
  const data = await chrome.storage.local.get(KEY);
  const list = data[KEY] || [];
  list.unshift({
    id: crypto.randomUUID(),
    ts: Date.now(),
    label: record.label,
    bar: LZString.compressToUTF16(JSON.stringify(record.barNodes || [])),
    profileBefore: record.profileBefore
      ? {
          id: record.profileBefore.id,
          name: record.profileBefore.name,
          nodes: LZString.compressToUTF16(JSON.stringify(record.profileBefore.nodes)),
        }
      : null,
  });
  while (list.length > MAX_BACKUPS) list.pop();
  await chrome.storage.local.set({ [KEY]: list });
}

// Метаданные копий для интерфейса (без тяжёлого содержимого).
export async function listBackups() {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] || []).map((b) => ({
    id: b.id,
    ts: b.ts,
    label: b.label,
    barCount: countBookmarks(JSON.parse(LZString.decompressFromUTF16(b.bar))),
    hasProfileBefore: !!b.profileBefore,
  }));
}

export async function getBackup(id) {
  const data = await chrome.storage.local.get(KEY);
  const b = (data[KEY] || []).find((x) => x.id === id);
  if (!b) return null;
  return {
    id: b.id,
    ts: b.ts,
    label: b.label,
    barNodes: JSON.parse(LZString.decompressFromUTF16(b.bar)),
    profileBefore: b.profileBefore
      ? { ...b.profileBefore, nodes: JSON.parse(LZString.decompressFromUTF16(b.profileBefore.nodes)) }
      : null,
  };
}
