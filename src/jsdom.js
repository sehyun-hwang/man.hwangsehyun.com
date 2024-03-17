import { JSDOM } from 'jsdom';

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

export default class StackEditDomModel {
  constructor(nodes) {
    const dom = new JSDOM();
    const { document } = dom.window;
    Object.assign(this, { dom, document, nodes });

    // eslint-disable-next-line no-restricted-syntax
    for (const node of sortNodes(this.nodes)) {
      console.log(node);
      this.appendNode(node);
    }
  }

  appendNode(dbItem) {
    console.log('Appending', dbItem);
    const { document } = this;
    const element = document.createElement(TYPE2HTML_TAGS[dbItem.type]);
    element.id = dbItem.id;
    element.textContent = dbItem.name;

    const parent = dbItem.parentId
      ? document.getElementById(dbItem.parentId)
      : document.body;
    parent.appendChild(element);
    return element;
  }

  get innerHTML() {
    return this.document.documentElement.innerHTML;
  }
}
