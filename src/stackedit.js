// @ts-check

/* eslint-disable max-classes-per-file */
import { Transform, Writable } from 'stream';
import { strict as assert } from 'assert';
import { pipeline } from 'stream/promises';
import { text } from 'stream/consumers';

import { ChangesFollower, CloudantV1 } from '@ibm-cloud/cloudant';
import Pick from 'stream-json/filters/Pick.js';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import parser from 'stream-json';

import FileSynchronizer from './file-sync.js';
import StackEditDomData from './dom-data.js';
import StackEditDomModel from './dom-model.js';
import StackEditPath from './path.js';
import { frontmatterMap } from './view-function.js';
import { parseFrontMatters } from './markdownlint.js';

const FRONTMATTER_PREFIX = 'frontmatter.';

const client = CloudantV1.newInstance({
  serviceUrl: 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com',
});
const db = 'stackedit';
const ddoc = 'hugo';
const VIEW_NAME = 'frontmatter';

async function assertDesignDocument() {
  const {
    result: {
      _rev,
      ...designDocument
    },
  } = await client.getDesignDocument({
    db,
    ddoc,
  });

  try {
    assert.deepEqual(designDocument, {
      _id: '_design/' + ddoc,
      language: 'javascript',
      views: {
        [VIEW_NAME]: { map: frontmatterMap },
      },
    });
  } catch (error) {
    console.log(frontmatterMap);
    throw error;
  }
}

/**
 * @typedef {{
 *   id: string,
 *   type: 'folder' | 'file' | 'content',
 *   hash: number | null,
 * }} StackEditItem
 */

/**
 * @callback StreamCallback
 */

/**
 * @typedef {StackEditItem & CloudantV1.Document & {
 *   _id: string,
 *   item: StackEditItem,
*    _attachments: {
*      data: CloudantV1.Attachment,
*    },
 * }} StackEditDocument
 */

class DatabaseWritable extends Writable {
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

async function buildDatabase() {
  const databaseWritable = new DatabaseWritable();

  await client.postViewAsStream({
    db,
    ddoc,
    view: VIEW_NAME,
    includeDocs: true,
  })
    .then(response => pipeline(
      response.result,
      parser(),
      new Pick({ filter: 'rows' }),
      new StreamArray(),
      databaseWritable,
    ));

  console.log('Parsed frontmatter missing in DB:', databaseWritable.missingFrontmatterDocs.length);
  console.log('Total contents:', databaseWritable.attachmentHashByDocId.size);
  return databaseWritable;
}
/**
 * @param {{
 *   _id: string,
 *   item: StackEditItem,
 * }[]} contentDocs
 */
const insertFrontMatterDocs = contentDocs => Promise.all(
  contentDocs.map(({
    _id: docId,
    item: { hash },
  }) => client.getAttachment({
    db,
    docId,
    attachmentName: 'data',
  })
    .then(async ({ result }) => [docId, await text(result), hash])),
)

  .then(async attachmentsEntires => {
    const attachmentsByDocId = Object.fromEntries(attachmentsEntires);
    const frontMatterBulkDocs = await parseFrontMatters(attachmentsByDocId);
    const hashByDocId = new Map();
    // eslint-disable-next-line no-unused-vars
    attachmentsEntires.forEach(([docId, _, hash]) => hashByDocId.set(docId, hash));

    frontMatterBulkDocs.forEach(doc => {
      // eslint-disable-next-line no-underscore-dangle, no-param-reassign
      doc._id = FRONTMATTER_PREFIX + hashByDocId.get(doc.contentId);
    });

    console.log('Inserting bulk docs of frontmatter', frontMatterBulkDocs);
    const { result } = await client.postBulkDocs({
      db,
      bulkDocs: { docs: frontMatterBulkDocs },
    });
    console.log('Parsed frontmatter inserted:', result.length);
    return result.length;
  });

const fetchDomData = () => client.postFind({
  db,
  selector: {
    item: {
      type: {
        $in: ['folder', 'file'],
      },
    },
  },
}).then(({ result: { warning, docs } }) => {
  console.log('Cloudant index warning:', warning);
  return new StackEditDomData(docs);
});

/**
 * @typedef {{
 *   _id: string,
 *   _rev: string,
 *   _deleted: true,
 * }} DeleteDoc
 */

/**
 * @param {Map<number, string>} idByNumberHash
 */
async function processFrontMatters(idByNumberHash) {
  /**
   * @type {DeleteDoc[]}
   */
  const deleteStaleFrontmatterDocsParam = [];
  const transform = new Transform({
    objectMode: true,
    /**
     * @param {{value: StackEditDocument}} param0
     */
    transform({ value }, _encoding, callback) {
      const numberHash = Number(value.id.replace(FRONTMATTER_PREFIX, ''));
      if (idByNumberHash.has(numberHash))
        callback(null, value);
      else {
        const { _id, _rev } = value.doc;
        deleteStaleFrontmatterDocsParam.push({
          _id, _rev, _deleted: true,
        });
        callback();
      }
    },
  });

  await client.postAllDocsAsStream({
    db,
    startKey: FRONTMATTER_PREFIX,
    endKey: FRONTMATTER_PREFIX + '\ufff0',
    includeDocs: true,
  })
    .then(({ result }) => pipeline(
      result,
      parser(),
      new Pick({ filter: 'rows' }),
      new StreamArray(),
      transform,
    ));

  const frontmatterDocsPromise = transform.toArray();
  await new Promise(resolve => transform.on('end', resolve));
  if (deleteStaleFrontmatterDocsParam.length) {
    console.log('Deleting stale frontmatters', deleteStaleFrontmatterDocsParam.length);
    await client.postBulkDocs({
      db,
      bulkDocs: {
        docs: deleteStaleFrontmatterDocsParam,
      },
    });
  }
  return frontmatterDocsPromise;
}

/**
 * @param {StackEditPath[]} stackEditPaths
 */
async function downloadMarkdownsBatch(stackEditPaths) {
  const gathered = await Promise.all(stackEditPaths.flatMap(path => [
    client.getAttachment({
      db,
      docId: path.contentId,
      attachmentName: 'data',
    }),
    path.createMarkdownWritable(),
  ]));

  await Promise.all((function* pipe() {
    for (let i = 0; i < gathered.length; i += 2)
      yield pipeline(gathered[i].result, gathered[i + 1]);
  })());
}

class ChangesWritable extends Writable {
  /**
   * @type {StackEditDomModel}
   */
  domModel;

  /**
 * @type {Object[]}
 */
  frontmatterDocs;

  /**
   * @param {{
   *   domModel: StackEditDomModel,
   *   frontmatterDocs: Object[],
   * }} arg
   */
  constructor(arg) {
    super({ objectMode: true });
    Object.assign(this, arg);
  }

  async processNode() {
    // this.frontmatterDocs; @TODO pop old one and insert new one, and feed to run
    Object.assign(this, await run());
  }

  /**
   * @param {string} docId
   * @param {StackEditItem} item
   */
  async processContent(docId, item) {
    const names = this.domModel.getNamesFromId(item.id.replace('/content', ''));
    const { headers: { etag }, result } = await client.getAttachment({
      db,
      docId,
      attachmentName: 'data',
    });
    if (!etag)
      throw new TypeError('No etag');
    database.updateContent(item, etag);
    console.log(database);

    const [frontmatter] = await parseFrontMatters({ [docId]: await text(result) });
    await client.postDocument({
      db,
      document: {
        _id: FRONTMATTER_PREFIX + item.hash,
        ...frontmatter,
      },
    });

    const path = new StackEditPath({ names, etag });
    console.log('To be deleted', await path.globMarkdown()); // @TODO and prune
    result.pipe(await path.createMarkdownWritable());
  }

  // eslint-disable-next-line class-methods-use-this
  /**
   * @param {CloudantV1.ChangesResultItem & {
   *   doc: StackEditDocument
   * }} param0
   * @param {string} _encoding
   * @param {StreamCallback} callback
   */
  async _write({ id: docId, changes, doc }, _encoding, callback) {
    console.log(doc.time ? new Date(doc.time) : new Date(), 'CHANGED', doc.item || doc);
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
/**
 * @param {ChangesWritable} changesWritable
 */
function followChanges(changesWritable) {
  const changesFollower = new ChangesFollower(client, {
    db,
    includeDocs: true,
    selector: {
      item: {
        $exists: true,
      },
    },
  });

  const endPromise = pipeline(changesFollower.start(), changesWritable);
  console.log('Following changes in db', db);
  return endPromise;
}

await assertDesignDocument();
const database = await buildDatabase();

/**
 * @param {{
 *   id: string,
 *   doc: { contentId: string },
 * }[] | null} frontMatterDocsArg
 */
async function run(frontMatterDocsArg = null) {
  database.missingFrontmatterDocs.length
    && insertFrontMatterDocs(database.missingFrontmatterDocs)
      .then(() => {
        database.missingFrontmatterDocs = [];
      });

  const domData = await fetchDomData();
  const domModel = new StackEditDomModel(domData.sortNodes());
  console.log(domModel.html);
  domData.assignDocId(domModel.assignDocId.bind(domModel));
  console.log(domModel.html);
  domModel.assignHashes(database.attachmentHashByDocId);
  console.log(domModel.html);

  const frontmatterDocs = frontMatterDocsArg
    || await processFrontMatters(database.idByNumberHash);
  const stackEditPaths = frontmatterDocs.map(({ id: docId, doc: { contentId } }) => {
    const id = database.idByNumberHash.get(Number(docId.replace(FRONTMATTER_PREFIX, '')));
    const names = domModel.getNamesFromId(id);
    const { hash: etag } = domModel.getDatasetFromId(id);
    console.log()
    return new StackEditPath({ contentId, names, etag });
  });

  const synchronizer = new FileSynchronizer(stackEditPaths);
  await synchronizer.processInvalidChecksums();
  await synchronizer.calculate();
  await synchronizer.prune();

  if (!frontMatterDocsArg) {
    const downloadCandidatePaths = Array.from(synchronizer.generateDownloadCandidates());
    downloadCandidatePaths.length
      && await downloadMarkdownsBatch(downloadCandidatePaths);
  }

  return {
    domModel,
    frontmatterDocs,
  };
}

const changesWritableParams = await run();
await followChanges(new ChangesWritable(changesWritableParams));
