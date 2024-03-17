import { join } from 'path';

import { JSDOM } from 'jsdom';

const HUGO_CONTENT_DIR = 'content';
// @TODO Change to https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details
const TYPE2HTML_TAGS = {
  folder: 'ul',
  file: 'li',
};

export function sortNodes(unsorted) {
  const sortedMap = new Map(
    unsorted.filter(({ parentId }) => !parentId).map(node => [node.id, node]),
  );

  do {
    unsorted.forEach(node => {
      if (sortedMap.has(node.id))
        return;
      sortedMap.has(node.parentId) && sortedMap.set(node.id, node);
    });
  } while (sortedMap.size !== unsorted.length);

  return sortedMap.values();
}

function* generateParentNode(element) {
  let current = element;
  do {
    yield current;
    // eslint-disable-next-line no-cond-assign
  } while (current = current.parentNode);
}

export default class StackEditDomModel {
  constructor(nodes) {
    const dom = new JSDOM();
    const { document } = dom.window;
    Object.assign(this, { dom, document, nodes });

    // eslint-disable-next-line no-restricted-syntax
    for (const node of sortNodes(this.nodes))
      this.appendNode(node);
  }

  get html() {
    return this.document.documentElement.outerHTML;
  }

  appendNode(dbItem) {
    console.log('Appending', dbItem);
    const { document } = this;
    const element = document.createElement(TYPE2HTML_TAGS[dbItem.type]);
    element.id = dbItem.id;
    element.dataset.name = dbItem.name;
    element.textContent = dbItem.name;

    const parent = dbItem.parentId
      ? document.getElementById(dbItem.parentId)
      : document.body;
    parent.appendChild(element);
    return element;
  }

  assignDocId(idPairs) {
    idPairs.forEach(([docId, itemId]) => {
      this.document.getElementById(itemId).dataset.docid = docId;
    });
  }

  getPathFromId(itemId) {
    console.log('Querying', itemId);
    const element = this.document.getElementById(itemId);
    const names = Array.from(generateParentNode(element)).map(parent => parent?.dataset?.name || '');
    names.reverse();
    const path = join(HUGO_CONTENT_DIR, ...names);
    if (path.endsWith('.generated.md'))
      return path;
    if (path.endsWith('.md'))
      return path.replace('.md', '.generated.md');
    return path + '.generated.md';
  }
}
