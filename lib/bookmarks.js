// Работа с панелью закладок через chrome.bookmarks.
//
// Узел дерева в компактном виде:
//   закладка: { t: 'заголовок', u: 'https://…' }
//   папка:    { t: 'заголовок', c: [дочерние узлы] }

export async function readBar() {
  const bar = await getBarFolder();
  if (!bar) throw new Error('Не удалось найти панель закладок');
  return (bar.children || []).map(toData);
}

// Полностью заменяет содержимое панели закладок на переданный набор.
export async function applyToBar(nodes) {
  const bar = await getBarFolder();
  if (!bar) throw new Error('Не удалось найти панель закладок');
  for (const child of (bar.children || []).slice()) {
    if (child.url) await chrome.bookmarks.remove(child.id);
    else await chrome.bookmarks.removeTree(child.id);
  }
  await createChildren(bar.id, nodes);
}

export function sameNodes(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Первый дочерний узел корня дерева закладок — это панель закладок
// (дальше идут «Другие закладки» и мобильные).
async function getBarFolder() {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  return root && root.children && root.children[0] ? root.children[0] : null;
}

function toData(node) {
  if (node.url) return { t: node.title || '', u: node.url };
  return { t: node.title || '', c: (node.children || []).map(toData) };
}

async function createChildren(parentId, nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.u) {
      await chrome.bookmarks.create({ parentId, index: i, title: node.t, url: node.u });
    } else {
      const folder = await chrome.bookmarks.create({ parentId, index: i, title: node.t });
      await createChildren(folder.id, node.c || []);
    }
  }
}
