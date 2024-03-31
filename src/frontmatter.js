// @ts-check

import { Transform } from 'stream';
import { text } from 'stream/consumers';

import groupBy from 'object.groupby';

import { FRONTMATTER_PREFIX } from './cloudant.js';
import { parseFrontMatters } from './markdownlint.js';

/**
 * @param {import('@ibm-cloud/cloudant').CloudantV1} client
 * @param {string} db
 * @param {{
 *   _id: string,
 *   item: import('./types.js').StackEditItem,
 * }[]} contentDocs
 */

export const insertFrontMatterDocs = (client, db, contentDocs) => Promise.all(
  contentDocs.map(({
    _id: docId,
    item: { hash },
  }) => client.getAttachment({
    db,
    docId,
    attachmentName: 'data',
  })
    .then(async ({ result }) => {
      const entry = [hash, await text(result)];
      entry.docId = docId;
      return entry;
    })),
)
  .then(async attachmentsEntires => {
    const frontMatterBulkDocs = await parseFrontMatters(Object.fromEntries(attachmentsEntires));
    const frontmatterAttachmentsByHash = groupBy(attachmentsEntires, ([hash]) => hash);
    frontMatterBulkDocs.forEach(doc => {
      // eslint-disable-next-line no-underscore-dangle, no-param-reassign
      doc._attachments = Object.assign(...frontmatterAttachmentsByHash[doc.hash].map(({ docId }) => ({
        [docId]: {
          data: '',
        },
      })));
    });

    console.log('Inserting bulk docs of frontmatter', frontMatterBulkDocs);
    const { result } = await client.postBulkDocs({
      db,
      bulkDocs: { docs: frontMatterBulkDocs },
    });
    console.log(result);
    if (result.every(({ ok }) => ok))
      return result.length;

    const errorSummary = new Set(result.map(({ error, reason }) => error + '-' + reason));
    throw new Error('One or more frontmatter docs insertion failed: ' + Array.from(errorSummary).join(', '));
  });

class FrontMatterTransformStream extends Transform {
  /** @type Map<number, string>} */
  idByNumberHash;

  /**
   * @type {{
   *   _id: string,
   *   _rev: string,
   *   _deleted: true,
   * }[]}
   */
  deleteStaleFrontmatterDocsParam = [];

  /**
   * @param {Map<number, string>} idByNumberHash
   */
  constructor(idByNumberHash) {
    super({ objectMode: true });
    this.idByNumberHash = idByNumberHash;
  }

  /**
   * @callback frontmatterCallback
   * @param {any} error
   * @param {import('./types.js').StackEditDocument} frontmatter
   * @returns {void}
   */

  /**
   * @param {{value: import('./types.js').StackEditDocument}} param0
   * @param {string} _encoding;
   * @param {frontmatterCallback & (() => void)} callback
   */
  _transform({ value: { id, doc } }, _encoding, callback) {
    const numberHash = Number(id.replace(FRONTMATTER_PREFIX, ''));
    if (this.idByNumberHash.has(numberHash))
      callback(null, doc);

    else {
      const { _id, _rev } = doc;
      this.deleteStaleFrontmatterDocsParam.push({
        _id, _rev, _deleted: true,
      });
      callback();
    }
  }

  async getDeleteStaleFrontmatterDocsParam() {
    await new Promise(resolve => this.on('end', resolve));
    return this.deleteStaleFrontmatterDocsParam;
  }
}

/**
 * @param {import('./cloudant.js').default} cloudant
 * @param {Map<number, string>} idByNumberHash
 */
export async function processFrontMatters(cloudant, idByNumberHash) {
  const transform = new FrontMatterTransformStream(idByNumberHash);
  await cloudant.streamFrontMatters(transform);
  const frontmatterDocsPromise = transform.toArray();

  const deleteStaleFrontmatterDocsParam = await transform.getDeleteStaleFrontmatterDocsParam();
  if (deleteStaleFrontmatterDocsParam.length) {
    console.log('Deleting stale frontmatters', deleteStaleFrontmatterDocsParam.length);
    const { db } = cloudant.constants;
    await cloudant.client.postBulkDocs({
      db,
      bulkDocs: {
        docs: deleteStaleFrontmatterDocsParam,
      },
    });
  }
  return frontmatterDocsPromise;
}
