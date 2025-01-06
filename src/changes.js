/* eslint-disable max-classes-per-file */
// @ts-check

import { Writable } from 'stream';
import { text } from 'stream/consumers';

import { FRONTMATTER_PREFIX } from './cloudant.js';
import { DomIdError } from './dom-model.js';
import { replaceHugoMount } from './file-sync.js';
import { appendFrontMatterAttachments } from './frontmatter.js';
import { parseFrontMatters } from './markdownlint.js';
import StackEditPath from './path.js';

/**
 * @typedef {import('./types.js').StackEditItem} StackEditItem
 * @typedef {import('./types.js').StackEditDocument} StackEditDocument
 */

/**
 * @callback StreamCallback
 */

export class StackEditDomModelParams {
  /** @type {import('@ibm-cloud/cloudant').CloudantV1} */
  client;

  /** @type {string} */
  db;

  /**  @type {import('./database.js').default} */
  database;

  /** @type {import('./dom-model.js').default} */
  domModel;

  /** @type {import('./markdownlint.js').FrontMatterDoc[]} */
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

  async processNode(doc) {
    Object.assign(this, await this.run(this.database, this.frontmatterDocs));
  }

  /**
   * @param {string} docId
   * @param {StackEditItem} item
   */
  async processContent(docId, item) {
    const { client, db } = this;
    const { headers: { etag }, result } = await client.getAttachment({
      db,
      docId,
      attachmentName: 'data',
    });
    if (!etag)
      throw new TypeError('No etag');

    const { database } = this;
    database.updateContent(item, etag);
    console.log('database sizes', database.bidirectionalMap.size, database.etagFromId.size);

    const markdown = await text(result);
    const [document] = await parseFrontMatters({ [item.hash]: markdown });
    document._attachments = {
      [docId]: {
        data: '',
      },
    };
    console.log('Changed frontmatter', document);
    this.frontmatterDocs.push(document);

    try {
      await client.postDocument({
        db,
        document,
      });
    } catch (error) {
      if (error.statusText !== 'Conflict')
        throw error;
      await appendFrontMatterAttachments(client, db, [document]);
    }

    const names = this.domModel.getNamesFromId(item.id.replace('/content', ''));
    const path = new StackEditPath({ names, etag, contentId: docId });
    const [prunedPath] = await path.prune();
    await path.createMarkdownWritable()
      .then(writable => writable.end(markdown));
    await replaceHugoMount(prunedPath, path.markdownPath);
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
        try {
          await this.processContent(docId, doc.item);
        } catch (error) {
          if (error instanceof DomIdError)
            this.queue = () => this.processContent(docId, doc.item);
          else
            throw error;
        }
        break;

      case 'folder':
      case 'file':
        await this.processNode(doc.item);
        this.queue && await this.queue();
        break;

      default:
        docId.startsWith(FRONTMATTER_PREFIX)
          || console.log('Unknown type', type);
    }

    callback();
  }
}
