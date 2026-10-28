// Модульные тесты логики расширения под Node: эмулируем chrome.storage
// и chrome.bookmarks, затем прогоняем store.js и bookmarks.js.
// Запуск: node tools/test.mjs

import assert from 'node:assert/strict';

// ---------- эмуляция chrome.storage ----------
function makeArea() {
  const map = new Map();
  return {
    get: async (keys) => {
      if (keys === null || keys === undefined) return Object.fromEntries(map);
      const out = {};
      if (typeof keys === 'string') {
        if (map.has(keys)) out[keys] = map.get(keys);
      } else if (Array.isArray(keys)) {
        for (const k of keys) if (map.has(k)) out[k] = map.get(k);
      } else {
        for (const k of Object.keys(keys)) out[k] = map.has(k) ? map.get(k) : keys[k];
      }
      return out;
    },
    set: async (obj) => {
      for (const [k, v] of Object.entries(obj)) map.set(k, JSON.parse(JSON.stringify(v)));
    },
    remove: async (keys) => {
      const ks = keys === null ? [...map.keys()] : (Array.isArray(keys) ? keys : [keys]);
      for (const k of ks) map.delete(k);
    },
    _map: map,
    QUOTA_BYTES: 102400,
    async getBytesInUse() { return 0; },
  };
}

// ---------- эмуляция chrome.bookmarks ----------
function makeBookmarks() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const root = { id: '0', title: '', children: [] };
  const bar = { id: '1', title: 'Bookmarks bar', parentId: '0', children: [] };
  const other = { id: '2', title: 'Other bookmarks', parentId: '0', children: [] };
  root.children.push(bar, other);
  const byId = new Map([['0', root], ['1', bar], ['2', other]]);
  let seq = 10;

  return {
    getTree: async () => [clone(root)],
    create: async ({ parentId, index, title, url }) => {
      const parent = byId.get(parentId);
      if (!parent) throw new Error('no parent ' + parentId);
      const node = url
        ? { id: String(++seq), parentId, title: title || '', url }
        : { id: String(++seq), parentId, title: title || '', children: [] };
      byId.set(node.id, node);
      if (typeof index === 'number') parent.children.splice(Math.min(index, parent.children.length), 0, node);
      else parent.children.push(node);
      return clone(node);
    },
    remove: async (id) => {
      const n = byId.get(id);
      const p = byId.get(n.parentId);
      p.children.splice(p.children.indexOf(n), 1);
      byId.delete(id);
    },
    removeTree: async (id) => {
      const n = byId.get(id);
      const p = byId.get(n.parentId);
      p.children.splice(p.children.indexOf(n), 1);
      const walk = (x) => { byId.delete(x.id); (x.children || []).forEach(walk); };
      walk(n);
    },
  };
}

globalThis.chrome = { storage: { sync: makeArea(), local: makeArea() }, bookmarks: makeBookmarks() };

const store = await import('../lib/store.js');
const bm = await import('../lib/bookmarks.js');

// ---------- helpers ----------
let passed = 0;
function test(name, fn) {
  return fn().then(
    () => { passed++; console.log('  ok –', name); },
    (err) => { console.error('  FAIL –', name, '\n', err); process.exitCode = 1; },
  );
}

function makeNodes(prefix, n) {
  // n закладок в папках по 10, с русскими названиями подлиннее
  const nodes = [];
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) {
      nodes.push({ t: `${prefix} Папка ${i} — тестовая, с длинным русским названием`, c: [] });
    }
    const folder = nodes[nodes.length - 1];
    folder.c.push({ t: `${prefix} Закладка ${i} — очень длинное русское название ссылки`, u: `https://example.com/${prefix}/${i}?q=тестовые-параметры-запроса` });
  }
  return nodes;
}

// ---------- тесты ----------
await test('readBar читает панель (первый дочерний узел корня)', async () => {
  await chrome.bookmarks.create({ parentId: '1', title: 'Вкл', url: 'https://vk.com' });
  const nodes = await bm.readBar();
  assert.deepEqual(nodes, [{ t: 'Вкл', u: 'https://vk.com' }]);
});

await test('applyToBar заменяет панель целиком, порядок и вложенность сохраняются', async () => {
  const setA = [
    { t: 'A1', u: 'https://a1.example' },
    { t: 'Папка A', c: [{ t: 'A2', u: 'https://a2.example' }, { t: 'Папка B', c: [{ t: 'A3', u: 'https://a3.example' }] }] },
  ];
  const setB = [
    { t: 'Папка C', c: [{ t: 'B1', u: 'https://b1.example' }] },
    { t: 'B2', u: 'https://b2.example' },
  ];
  await bm.applyToBar(setA);
  assert.deepEqual(await bm.readBar(), setA);
  await bm.applyToBar(setB);
  assert.deepEqual(await bm.readBar(), setB);
  await bm.applyToBar(setA);
  assert.deepEqual(await bm.readBar(), setA);
  assert.equal((await chrome.bookmarks.getTree())[0].children[1].children.length, 0, 'другие закладки не тронуты');
});

await test('saveProfile/getProfile: сжатие, чанки, уменьшение профиля', async () => {
  const nodes = makeNodes('тест', 300); // ~180 КБ сырого JSON
  const json = JSON.stringify(nodes);
  const meta = await store.saveProfile('p1', 'Работа', nodes);
  assert.ok(meta.chunks >= 2, 'ожидались несколько чанков, вышло ' + meta.chunks);
  assert.equal(meta.count, 300);
  const loaded = await store.getProfile('p1');
  assert.deepEqual(loaded.nodes, nodes);

  // сжатие реально экономит место: чанки в сумме заметно меньше сырого JSON
  const storedBytes = [...chrome.storage.sync._map.keys()]
    .filter((k) => k.startsWith('p:p1:'))
    .reduce((acc, k) => acc + chrome.storage.sync._map.get(k).length, 0);
  assert.ok(storedBytes < json.length / 2, `сжатие слабое: ${storedBytes} vs ${json.length}`);

  // уменьшение профиля должно убирать лишние чанки
  const small = makeNodes('мало', 5);
  await store.saveProfile('p1', 'Работа', small);
  const meta2 = (await store.getIndex()).profiles.p1;
  const leftover = [...chrome.storage.sync._map.keys()].filter((k) => k.startsWith('p:p1:'));
  assert.equal(leftover.length, meta2.chunks, 'хвостовые чанки не удалены');
  assert.deepEqual((await store.getProfile('p1')).nodes, small);
});

await test('чтение профилей старого формата v1 (несжатый JSON)', async () => {
  // эмуляция записи профиля версией 1.0.0: сырой JSON по кускам, метка v отсутствует
  const nodes = [{ t: 'Хабр', u: 'https://habr.com' }, { t: 'Папка', c: [{ t: 'Вики', u: 'https://wikipedia.org' }] }];
  const json = JSON.stringify(nodes);
  const mid = Math.ceil(json.length / 2);
  const chunks = [json.slice(0, mid), json.slice(mid)];
  const payload = { 'p:old:0': chunks[0], 'p:old:1': chunks[1] };
  await chrome.storage.sync.set(payload);
  const index = await store.getIndex();
  index.profiles.old = { id: 'old', name: 'Старый', chunks: 2, count: 2, updated: Date.now() };
  await chrome.storage.sync.set({ profilesIndex: index });

  const loaded = await store.getProfile('old');
  assert.deepEqual(loaded.nodes, nodes, 'v1-профиль должен читаться как есть');
  // пересохранение переводит его в сжатый v2 и не теряет данные
  await store.saveProfile('old', 'Старый', loaded.nodes);
  const meta = (await store.getIndex()).profiles.old;
  assert.equal(meta.v, 2);
  assert.deepEqual((await store.getProfile('old')).nodes, nodes);
});

await test('профили не смешиваются, удаление чистит все ключи', async () => {
  const a = makeNodes('alpha', 40);
  const b = makeNodes('beta', 40);
  await store.saveProfile('pa', 'A', a);
  await store.saveProfile('pb', 'B', b);
  assert.deepEqual((await store.getProfile('pa')).nodes, a);
  assert.deepEqual((await store.getProfile('pb')).nodes, b);

  await store.deleteProfile('pa');
  assert.equal(await store.getProfile('pa'), null);
  const rest = [...chrome.storage.sync._map.keys()].filter((k) => k.startsWith('p:pa:'));
  assert.equal(rest.length, 0, 'остались ключи удалённого профиля');
  assert.ok((await store.getProfile('pb')) !== null, 'профиль B не должен пострадать');
});

await test('activeProfileId — локальный флаг', async () => {
  assert.equal(await store.getActiveId(), null);
  await store.setActiveId('pb');
  assert.equal(await store.getActiveId(), 'pb');
  await store.setActiveId(null);
  assert.equal(await store.getActiveId(), null);
});

await test('сценарий пользователя: работа/дом на двух машинах', async () => {
  const work = [{ t: 'Jira', u: 'https://jira.example' }, { t: 'GitLab', u: 'https://git.example' }];
  const home = [{ t: 'YouTube', u: 'https://youtube.com' }];

  // у каждой машины своё дерево закладок и своё локальное хранилище,
  // синхронизируемое хранилище (sync) — общее
  const syncArea = makeArea();
  const makeMachine = () => ({
    storage: { sync: syncArea, local: makeArea(), QUOTA_BYTES: 102400, getBytesInUse: async () => 0 },
    bookmarks: makeBookmarks(),
  });
  const workM = makeMachine();
  const homeM = makeMachine();

  // машина «работа»: создаём профиль из панели
  globalThis.chrome = workM;
  await bm.applyToBar(work);
  await store.saveProfile('pw', 'Работа', await bm.readBar());
  await store.setActiveId('pw');

  // машина «дом»: тот же sync, своя панель
  globalThis.chrome = homeM;
  await bm.applyToBar(home);
  await store.saveProfile('ph', 'Дом', await bm.readBar());
  await store.setActiveId('ph');

  // снова машина «работа»: свой активный профиль и своя панель на месте
  globalThis.chrome = workM;
  assert.equal(await store.getActiveId(), 'pw');
  assert.deepEqual(await bm.readBar(), work);

  // переключение на «Дом» и обратно с автосохранением панели в её профиль
  await store.saveProfile('pw', 'Работа', await bm.readBar());
  await bm.applyToBar((await store.getProfile('ph')).nodes);
  await store.setActiveId('ph');
  assert.deepEqual(await bm.readBar(), home);

  await store.saveProfile('ph', 'Дом', await bm.readBar());
  await bm.applyToBar((await store.getProfile('pw')).nodes);
  await store.setActiveId('pw');
  assert.deepEqual(await bm.readBar(), work);

  // машина «дом» ничего не заметила: активен «Дом», панель домашняя
  globalThis.chrome = homeM;
  assert.equal(await store.getActiveId(), 'ph');
  assert.deepEqual(await bm.readBar(), home);
});

console.log(passed === 7 ? '\nВсе тесты пройдены ✔' : '\nЕсть падения ✘');
