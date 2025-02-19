// @ts-check

import { Transform } from 'stream';
import { text } from 'stream/consumers';

import groupBy from 'object.groupby';

import { FRONTMATTER_PREFIX } from './cloudant.js';
import { parseFrontMatters } from './markdownlint.js';

/**
 *
 * @param {import('@ibm-cloud/cloudant').CloudantV1} client
 * @param {string} db
 * @param {import('./markdownlint.js').FrontMatterDoc[]} frontMatterDocs
 * @returns {Promise<number>}
 */
export async function appendFrontMatterAttachments(client, db, frontMatterDocs) {
  const { result: { rows } } = await client.postAllDocs({
    db,
    keys: frontMatterDocs.map(({ _id }) => _id),
  });
  console.log('conflictedFrontMatterDocs', frontMatterDocs, rows);

  console.log(await Promise.all(frontMatterDocs.map(({ _id: docId, _attachments }, i) => client
    .putAttachment({
      db,
      docId,
      rev: rows[i].value.rev,
      attachmentName: Object.keys(_attachments)[0],
      attachment: Buffer.alloc(0),
      contentType: 'application/octet-stream',
    }))));

  return frontMatterDocs.length;
}

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
  }, i) => new Promise(resolve => setTimeout(resolve, i * 60))
    .then(() => client.getAttachment({
      db,
      docId,
      attachmentName: 'data',
    }))
    .then(async ({ result }) => {
      const entry = [hash, await text(result)];
      entry.docId = docId;
      return entry;
    })),
)
  .then(async attachmentsEntries => {
    const frontMatterBulkDocs = await parseFrontMatters(Object.fromEntries(attachmentsEntries));
    const frontmatterAttachmentsByHash = groupBy(attachmentsEntries, ([hash]) => hash);
    frontMatterBulkDocs.forEach(doc => {
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
    if (result.every(({ ok }) => ok))
      return result.length;

    if (result.every(({ error }) => error !== 'conflict')) {
      const errorSummary = new Set(result.map(({ error, reason }) => error + ' - ' + reason));
      throw new Error('One or more frontmatter docs insertion failed: ' + Array.from(errorSummary).join(', '));
    }

    const conflictedIds = new Set(result.map(({ id }) => id));
    const conflictedFrontMatterDocs = frontMatterBulkDocs
      .filter(({ _id }) => conflictedIds.has(_id));
    return appendFrontMatterAttachments(client, db, conflictedFrontMatterDocs);
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
 * @param {Map<number, string>} idByHash
 */
export async function processFrontMatters(cloudant, idByHash) {
  console.log('processFrontMatters');
  const transform = new FrontMatterTransformStream(idByHash);
  const frontmatterDocsPromise = transform.toArray();
  await cloudant.streamFrontMatters(transform);

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
