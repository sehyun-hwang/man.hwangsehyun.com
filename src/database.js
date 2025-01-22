// @ts-check
import { Writable } from 'stream';

/**
 * @typedef {import('./types.js').StackEditDocument} StackEditDocument
 * @typedef {import('./types.js').StackEditItem} StackEditItem
 */

export default class DatabaseWritable extends Writable {
  /**
   * @typedef {{
   *   key: number,
   *   value: {
   *     id: string,
   *     key: [string, 0 | 1],
   *     value: StackEditItem,
   *     doc: StackEditDocument | null,
   *   },
   * }} ChangeData
   */

  /** @type {ChangeData | null} */
  prev = null;

  /** @type {StackEditDocument[]} */
  missingFrontmatterDocs = [];

  /** @type {Map<string, string>} */
  etagFromId = new Map();

  /** @type {Map<number | string, string | number>} */
  bidirectionalMap = new Map();

  constructor() {
    super({ objectMode: true });
  }

  /**
   * @callback StreamCallback
   */

  /**
   * @param {ChangeData} data
   * @param {string} encoding
   * @param {StreamCallback} callback
   */
  _write(data, encoding, callback) {
    const { prev } = this;
    this.prev = data;
    // console.log(data);

    const { doc, value } = data.value;
    if (value?.type !== 'content') {
      ((prev?.value?.id || '') in (doc?._attachments || {}))
        || this.missingFrontmatterDocs.push(prev.value.doc);
      return callback();
    }

    // type === 'content'
    const etag = doc._attachments.data?.digest?.replace('md5-', '');
    if (!etag)
      throw TypeError('No etag value');
    this.updateContent(value, etag);
    return callback();
  }

  /**
   * @param {StackEditItem} item
   * @param {string} etag
   */
  updateContent(item, etag) {
    const id = item.id.replace('/content', '');
    this.etagFromId.set(id, etag);
    this.bidirectionalMap.set(item.hash, id);
    this.bidirectionalMap.set(id, item.hash);
  }
}
