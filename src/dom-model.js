// @ts-check

/* eslint-disable max-classes-per-file */
import { JSDOM } from 'jsdom';

const ID_PREFIX = 'stackedit-';

// @TODO Change to https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details
const TYPE2HTML_TAGS = {
  folder: 'details',
  file: 'li',
  content: 'p',
};

export class DomIdError extends Error {}

/**
 * @param element {HTMLElement}
 */
function* generateParentNode(element) {
  /** @type {HTMLElement | null} */
  let current = element;
  do {
    yield current;
    // eslint-disable-next-line no-cond-assign
  } while (current = current.parentElement);
}

export default class StackEditDomModel {
  /** @type {Document} */
  document;

  /** @param {Map<string, import('./types.js').StackEditItem>} sortedDocs */
  constructor(sortedDocs) {
    const dom = new JSDOM();
    const { document } = dom.window;
    this.dom = dom;
    this.document = document;
    this.docs = sortedDocs;

    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'tree.css';
    document.head.appendChild(style);

    // eslint-disable-next-line no-restricted-syntax
    for (const node of sortedDocs.values())
      this.appendNode(node);
    console.table(Array.from(sortedDocs.values()));
  }

  get html() {
    console.log('html');
    return this.document.documentElement.outerHTML;
  }

  /**
   * @param id {string}
   */
  selectId(id) {
    const element = this.document.getElementById(ID_PREFIX + id);
    if (element)
      return element;
    throw new DomIdError(`Missing StackEdit item id on DOM: ${id}`);
  }

  /**
   * @param dbItem {import('./types.js').StackEditItem}
   */
  appendNode(dbItem) {
    const { document } = this;
    const tag = TYPE2HTML_TAGS[dbItem.type];
    const element = document.createElement(tag);
    if (tag === 'details') {
      const detailsElement = /** @type {HTMLDetailsElement} */ (element);
      detailsElement.open = true;
    }
    element.id = ID_PREFIX + dbItem.id;
    element.dataset.name = dbItem.name;

    {
      const child = document.createElement(dbItem.type === 'folder' ? 'summary' : 'h3');
      child.textContent = dbItem.name;
      element.appendChild(child);
    }

    const parent = dbItem.parentId
      ? this.selectId(dbItem.parentId)
      : document.body;
    parent.appendChild(element);
    return element;
  }

  /** @param {string} docId @param {string} itemId */
  assignDocId(docId, itemId) {
    this.selectId(itemId).dataset.docid = docId;
  }

  /** @param {Map<string | number, string | number>} bidirectionalMap @param {Map<string, string>} etagFromId */
  assignData(bidirectionalMap, etagFromId) {
    bidirectionalMap.forEach((value, key) => {
      if (typeof key !== 'string')
        return;
      try {
        const element = this.selectId(key);
        element.dataset.hash = String(value);
      } catch (error) {
        if (!(error instanceof DomIdError))
          throw error;
      }
    });

    etagFromId.forEach((etag, id) => {
      try {
        const element = this.selectId(id);
        element.dataset.etag = etag;
      } catch (error) {
        if (!(error instanceof DomIdError))
          throw error;
      }
    });
  }

  /**
   * @param {number} hash
   */
  selectByHash(hash) {
    return this.document.querySelectorAll(/** @type {string} */ (`[data-hash="${hash}"]`));
  }

  /** @param {import('./markdownlint.js').FrontMatterDoc} doc */
  appendFrontmatter(doc) {
    const contentIds = Object.keys(doc._attachments || {});
    const { length } = contentIds.filter(contentId => {
      const elements = this.selectByHash(doc.hash);
      if (!elements.length) {
        return false;
      }

      elements.forEach(node => {
        const element = /** @type {HTMLElement} */ (node);
        if (element.dataset.contentid)
          return;
        element.dataset.contentid = contentId;
        const p = this.document.createElement(TYPE2HTML_TAGS.content);
        p.textContent = JSON.stringify(doc);
        element.appendChild(p);
      });

      return true;
    });
    if (!length)
      throw new Error(`Stale frontmatter ${contentIds}`);
  }

  /** @param {string} itemId */
  getNamesFromId(itemId) {
    console.log('Querying', itemId);
    const element = this.selectId(itemId);
    const names = Array.from(generateParentNode(element)).map(parent => parent?.dataset?.name || '');
    names.reverse();
    return names;
  }

  /** @param {string} itemId */
  getDatasetFromId(itemId) {
    const { dataset } = this.selectId(itemId);
    if (dataset.etag && dataset.contentid)
      return { etag: dataset.etag, contentid: dataset.contentid };
    throw new DomIdError(`Missing dataset on DOM: ${itemId}`);
  }
}
