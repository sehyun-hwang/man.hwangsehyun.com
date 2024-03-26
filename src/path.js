// @ts-check

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';

import { glob } from 'glob';

export const HUGO_CONTENT_DIR = 'content';

export default class StackEditPath {
  /**
   * @type string[]
   */
  names;

  /**
   * @type string
   */
  _etag;

  /**
   * @type string
   */
  contentId;

  set etag(etag) {
    this._etag = etag;
    this.digest = Buffer.from(etag, 'base64').toString('hex');
  }

  get etag() {
    return this._etag;
  }

  /**
   * @param {{
   *   names: string[],
   *   etag: string,
   *   contentId?: string,
   * }} arg
   */
  constructor(arg) {
    Object.assign(this, arg);
  }

  get markdownPath() {
    const dbPath = path.join(HUGO_CONTENT_DIR, ...this.names);
    const postfix = `.${this.digest}.generated.md`;
    const replaced = dbPath.replace(/.generated.md$|.md$/, postfix);
    return replaced === dbPath ? dbPath + postfix : replaced;
  }

  /**
   * @todo Add pruning, and rename
   */
  globMarkdown() {
    const { markdownPath, digest } = this;
    const dirname = path.dirname(markdownPath);
    const basename = path.basename(markdownPath, `.${digest}.generated.md`);
    return glob(`${dirname}/${basename}.*.generated.md`);
  }

  async createMarkdownWritable() {
    const { markdownPath } = this;
    const folder = path.dirname(markdownPath);
    await mkdir(folder, { recursive: true });
    return createWriteStream(markdownPath);
  }
}
