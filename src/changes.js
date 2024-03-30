/* eslint-disable max-classes-per-file */
// @ts-check

import { Writable } from 'stream';
import { text } from 'stream/consumers';

import { FRONTMATTER_PREFIX } from './cloudant.js';
import StackEditPath from './path.js';
import { parseFrontMatters } from './markdownlint.js';

/**
 * @typedef {import('./dom-model.js').default} StackEditDomModel
 * @typedef {import('./types.js').StackEditItem} StackEditItem
 * @typedef {import('./types.js').StackEditDocument} StackEditDocument
 */

/**
 * @callback StreamCallback
 */

// eslint-disable-next-line no-unused-vars
export class StackEditDomModelParams {
  /** @type {import('@ibm-cloud/cloudant').CloudantV1} */
  client;

  /** @type {string} */
  db;

  /**  @type {import('./database.js').default} */
  database;

  /** @type {import('./dom-model.js').default} */
  domModel;

  /** @type {Object[]} */
  frontmatterDocs;
}

/** @type {typeof StackEditDomModelParams} */
// @ts-ignore
const Foo = Writable;

export default class ChangesWritable extends Foo {
  /**
   * @param {StackEditDomModelParams} params
   */
  constructor(params) {
    super({ objectMode: true });
    Object.assign(this, params);
  }

  async processNode() {
    // this.frontmatterDocs; @TODO pop old one and insert new one, and feed to run
    Object.assign(this, await this.run(this.database));
  }

  /**
   * @param {string} docId
   * @param {StackEditItem} item
   */
  async processContent(docId, item) {
    const { client, db } = this;
    const names = this.domModel.getNamesFromId(item.id.replace('/content', ''));
    const { headers: { etag }, result } = await client.getAttachment({
      db,
      docId,
      attachmentName: 'data',
    });
    if (!etag)
      throw new TypeError('No etag');

    const { database } = this;
    database.updateContent(item, etag);
    console.log('database sizes', database.idByNumberHash.size, database.attachmentHashByDocId.size);

    const [frontmatter] = await parseFrontMatters({ [docId]: await text(result) });
    await client.postDocument({
      db,
      document: {
        _id: FRONTMATTER_PREFIX + item.hash,
        ...frontmatter,
      },
    });

    const path = new StackEditPath({ names, etag });
    await path.prune();
    result.pipe(await path.createMarkdownWritable());
  }

  /**
   * @param {import('@ibm-cloud/cloudant').CloudantV1.ChangesResultItem & {
   *   doc: StackEditDocument
   * }} param0
   * @param {string} _encoding
   * @param {StreamCallback} callback
   */
  async _write({ id: docId, changes, doc }, _encoding, callback) {
    console.log(doc.time ? new Date(doc.time) : new Date(), 'CHANGED', changes, doc.item || doc);
    const type = doc?.item?.type;

    switch (type) {
      case 'content':
        await this.processContent(docId, doc.item);
        break;
      case 'folder':
      case 'file':
        await this.processNode(doc.item);
        break;
      default:
        docId.startsWith(FRONTMATTER_PREFIX)
          || console.log('Unknown type', type);
    }

    callback();
  }
}