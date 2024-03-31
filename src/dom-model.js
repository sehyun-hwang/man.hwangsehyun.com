/* eslint-disable max-classes-per-file */
import { JSDOM } from 'jsdom';

const ID_PREFIX = 'stackedit-';

// @TODO Change to https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details
const TYPE2HTML_TAGS = {
  folder: 'details',
  file: 'li',
  content: 'p',
};

export class DomIdError extends Error { }

function* generateParentNode(element) {
  let current = element;
  do {
    yield current;
    // eslint-disable-next-line no-cond-assign
  } while (current = current.parentNode);
}

export default class StackEditDomModel {
  /** @type */
  dom;

  /**  @type {Document} */
  document;

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
    const tag = TYPE2HTML_TAGS[dbItem.type];
    const element = document.createElement(tag);
    if (tag === 'details')
      element.open = true;
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

  assignDocId(docId, itemId) {
    this.selectId(itemId).dataset.docid = docId;
  }

  assignData(bidirectionalMap, etagFromId) {
    bidirectionalMap.forEach((value, key) => {
      if (typeof key === 'string')
        this.selectId(key).dataset.hash = value;
    });

    etagFromId.forEach((etag, id) => {
      console.log(id);
      this.selectId(id).dataset.etag = etag;
    });
  }

  /**
   * @param {number} hash
   */
  selectByHash(hash) {
    return this.document.querySelectorAll(`[data-hash="${hash}"]`);
  }

  appendFrontmatter(doc) {
    const contentIds = Object.keys(doc._attachments);
    const { length } = contentIds.filter(contentId => {
      const elements = this.selectByHash(doc.hash);
      if (!elements) {
        return false;
      }

      elements.forEach(element => {
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

  getNamesFromSelector(selector) {
    console.log('Querying', selector);
    const element = this.document.querySelector(selector);
    if (!element)
      throw new DomIdError(`Missing StackEdit item id on DOM: ${selector}`);
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
}
