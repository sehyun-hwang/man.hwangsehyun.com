import { Writable } from 'stream';

export default class DatabaseWritable extends Writable {
  /**
   * @type {{
   *   value: {
   *     doc: StackEditDocument | null,
   *   }
   * } | null}
   */
  prev = null;

  /**
   * @type {StackEditDocument[]}
   */
  missingFrontmatterDocs;

  constructor() {
    super({ objectMode: true });
    this.missingFrontmatterDocs = [];
    this.idByNumberHash = new Map();
    this.attachmentHashByDocId = new Map();
  }

  // eslint-disable-next-line class-methods-use-this
  /**
   * @param {{
   *   key: number,
   *   value: {
   *     id: string,
   *     key: [string, 0 | 1],
   *     value: StackEditItem,
   *     doc: StackEditDocument | null,
   *   },
   * }} data
   * @param {string} encoding
   * @param {StreamCallback} callback
   */
  _write(data, encoding, callback) {
    const { prev } = this;
    this.prev = data;
    // console.log(data);

    const { doc, value } = data.value;
    if (!doc) {
      if (!prev?.value?.doc)
        throw new TypeError('No prev?.value?.doc');
      this.missingFrontmatterDocs.push(prev?.value?.doc);
      return callback();
    }

    if (value?.type !== 'content')
      return callback();

    // eslint-disable-next-line no-underscore-dangle
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
    this.idByNumberHash.set(item.hash, id);
    this.attachmentHashByDocId.set(id, etag);
  }
}
