// @ts-check

import { Transform } from 'stream';
import { text } from 'stream/consumers';

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
      rev: rows[i].value?.rev,
      attachmentName: Object.keys(_attachments || {})[0],
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
      return { hash, markdown: await text(result), docId };
    })),
)
  .then(async attachmentsEntries => {
    const frontMatterBulkDocs = await parseFrontMatters(Object.fromEntries(attachmentsEntries.map(({ hash, markdown }) => [hash, markdown])));
    frontMatterBulkDocs.forEach(doc => {
      doc._attachments = Object.fromEntries(attachmentsEntries
        .filter(({ hash }) => hash === doc.hash)
        .map(({ docId }) => [docId, { data: Buffer.alloc(0) }]));
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

    const failures = result.filter(({ ok }) => !ok);
    if (failures.some(({ error }) => error !== 'conflict'))
      throw new Error('One or more frontmatter docs insertion failed: ' + failures.map(({ error, reason }) => error + ' - ' + reason).join(', '));
    const conflictedIds = new Set(failures.map(({ id }) => id));
    const conflictedFrontMatterDocs = frontMatterBulkDocs
      .filter(({ _id }) => conflictedIds.has(_id));
    return appendFrontMatterAttachments(client, db, conflictedFrontMatterDocs);
  });

class FrontMatterTransformStream extends Transform {
  /** @type {Map<number | string, string | number>} */
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
   * @param {Map<number | string, string | number>} idByNumberHash
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

}

/**
 * @param {import('./cloudant.js').default} cloudant
 * @param {Map<number | string, string | number>} idByHash
 */
export async function processFrontMatters(cloudant, idByHash) {
  console.log('processFrontMatters');
  const transform = new FrontMatterTransformStream(idByHash);
  const frontmatterDocsPromise = transform.toArray();
  await cloudant.streamFrontMatters(transform);

  const frontmatterDocs = await frontmatterDocsPromise;
  const { deleteStaleFrontmatterDocsParam } = transform;
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
  return frontmatterDocs;
}
