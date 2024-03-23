import { JSDOM } from 'jsdom';

const ID_PREFIX = 'stackedit-';

// @TODO Change to https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details
const TYPE2HTML_TAGS = {
  folder: 'ul',
  file: 'li',
};

function* generateParentNode(element) {
  let current = element;
  do {
    yield current;
    // eslint-disable-next-line no-cond-assign
  } while (current = current.parentNode);
}

export default class StackEditDomModel {
  constructor(sortedDocs) {
    const dom = new JSDOM();
    const { document } = dom.window;
    Object.assign(this, { dom, document, docs: sortedDocs });

    // eslint-disable-next-line no-restricted-syntax
    for (const node of sortedDocs.values())
      this.appendNode(node);
  }

  get html() {
    console.log('html');
    return this.document.documentElement.outerHTML;
  }

  selectId(id) {
    return this.document.getElementById(ID_PREFIX + id);
  }

  appendNode(dbItem) {
    console.log('Appending', dbItem);
    const { document } = this;
    const element = document.createElement(TYPE2HTML_TAGS[dbItem.type]);
    element.id = ID_PREFIX + dbItem.id;
    element.dataset.name = dbItem.name;
    element.textContent = dbItem.name;

    const parent = dbItem.parentId
      ? this.selectId(dbItem.parentId)
      : document.body;
    parent.appendChild(element);
    return element;
  }

  assignDocId(docId, itemId) {
    this.selectId(itemId).dataset.docid = docId;
  }

  assignHashes(attachmentHashByDocId) {
    attachmentHashByDocId.forEach((hash, docId) => {
      this.selectId(docId).dataset.hash = hash;
    });
  }

  getNamesFromSelector(selector) {
    console.log('Querying', selector);
    const element = this.document.querySelector(selector);
    const names = Array.from(generateParentNode(element)).map(parent => parent?.dataset?.name || '');
    names.reverse();
    return names;
  }

  getNamesFromId(itemId) {
    return this.getNamesFromSelector('#' + ID_PREFIX + itemId);
  }

  getDatasetFromId(itemId) {
    return this.selectId(itemId).dataset;
  }

  getNamesFromDocId(docId) {
    return this.getNamesFromSelector(`[data-docid='${docId}']`);
  }
}
