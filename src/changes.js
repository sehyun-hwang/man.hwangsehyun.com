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
 * @typedef {{
 *   client: import('@ibm-cloud/cloudant').CloudantV1,
 *   db: string,
 *   database: import('./database.js').default,
 *   domModel: import('./dom-model.js').default,
 *   frontmatterDocs: import('./markdownlint.js').FrontMatterDoc[],
 *   run: (database: import('./database.js').default, docs: import('./markdownlint.js').FrontMatterDoc[]) => Promise<StackEditDomModelParams>,
 * }} StackEditDomModelParams
 */

export default class ChangesWritable extends Writable {
  /** @param {StackEditDomModelParams} params */
  constructor(params) {
    super({ objectMode: true });
    this.client = params.client;
    this.db = params.db;
    this.database = params.database;
    this.domModel = params.domModel;
    this.frontmatterDocs = params.frontmatterDocs;
    this.run = params.run;
    /** @type {(() => Promise<void>) | undefined} */
    this.queue = undefined;
  }

  async processNode() {
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
        data: Buffer.alloc(0),
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
      if (!(error instanceof Error) || !('statusText' in error) || error.statusText !== 'Conflict')
        throw error;
      await appendFrontMatterAttachments(client, db, [document]);
    }

    const names = this.domModel.getNamesFromId(item.id.replace('/content', ''));
    const path = new StackEditPath({ names, etag, contentId: docId });
    await path.prune();
    const writable = await path.createMarkdownWritable();
    await new Promise((resolve, reject) => {
      writable.on('error', reject);
      writable.end(markdown, () => resolve(undefined));
    });
    await replaceHugoMount();
  }

  /**
   * @param {import('@ibm-cloud/cloudant').CloudantV1.ChangesResultItem & {
   *   doc: StackEditDocument
   * }} chunk
   * @param {string} _encoding
   * @param {(error?: Error | null) => void} callback
   */
  _write(chunk, _encoding, callback) {
    this.writeChange(chunk).then(() => callback(), error => callback(error));
  }

  /** @param {import('@ibm-cloud/cloudant').CloudantV1.ChangesResultItem & { doc: StackEditDocument }} chunk */
  async writeChange({ id: docId, changes, doc }) {
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
        await this.processNode();
        this.queue && await this.queue();
        break;

      default:
        docId.startsWith(FRONTMATTER_PREFIX)
          || console.log('Unknown type', type);
    }

  }
}
