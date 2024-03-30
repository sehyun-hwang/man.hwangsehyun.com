// @ts-check

import Cloudant4Hugo, { FRONTMATTER_PREFIX } from './cloudant.js';
import { insertFrontMatterDocs, processFrontMatters } from './frontmatter.js';
import ChangesWritable from './changes.js';
import DatabaseWritable from './database.js';
import FileSynchronizer from './file-sync.js';
import StackEditDomData from './dom-data.js';
import StackEditDomModel from './dom-model.js';
import StackEditPath from './path.js';

const staticCloudant = new Cloudant4Hugo({
  serviceUrl: 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com',
});

/**
 * @typedef {import('@ibm-cloud/cloudant').CloudantV1} CloudantV1
 * @typedef {import('@ibm-cloud/cloudant').CloudantV1.Document} Document
 * @typedef {import('@ibm-cloud/cloudant').CloudantV1.Attachment} Attachment
 */

/**
 * @param {Cloudant4Hugo} cloudant
 * @param {DatabaseWritable} database
 * @param {{
 *   id: string,
 *   doc: { contentId: string },
 * }[] | null} frontMatterDocsArg
 * @returns {Promise<import('./changes.js').StackEditDomModelParams>}
 */
async function run(cloudant, database, frontMatterDocsArg = null) {
  database.missingFrontmatterDocs.length
    && insertFrontMatterDocs(
      cloudant.client,
      cloudant.constants.db,
      database.missingFrontmatterDocs,
    )
      .then(() => {
        // eslint-disable-next-line no-param-reassign
        database.missingFrontmatterDocs = [];
      });

  const domData = new StackEditDomData(await cloudant.fetchDomData());
  const domModel = new StackEditDomModel(domData.sortNodes());
  console.log(domModel.html);
  domData.assignDocId(domModel.assignDocId.bind(domModel));
  console.log(domModel.html);
  domModel.assignHashes(database.attachmentHashByDocId);
  console.log(domModel.html);

  const frontmatterDocs = frontMatterDocsArg
    || await processFrontMatters(cloudant, database.idByNumberHash);
  const stackEditPaths = frontmatterDocs.map(({ id: docId, doc: { contentId } }) => {
    const id = database.idByNumberHash.get(Number(
      docId.replace(FRONTMATTER_PREFIX, ''),
    ));
    const names = domModel.getNamesFromId(id);
    const { hash: etag } = domModel.getDatasetFromId(id);
    return new StackEditPath({ contentId, names, etag });
  });

  const synchronizer = new FileSynchronizer(stackEditPaths);
  await synchronizer.processInvalidChecksums();
  await synchronizer.calculate();
  await synchronizer.prune();

  if (!frontMatterDocsArg) {
    const downloadCandidatePaths = Array.from(synchronizer.generateDownloadCandidates());
    downloadCandidatePaths.length
      && await cloudant.downloadMarkdownsBatch(downloadCandidatePaths);
  }

  const { client, constants: { db } } = cloudant;
  return {
    client,
    db,
    database,
    domModel,
    frontmatterDocs,
  };
}

{
  const cloudant = staticCloudant;
  await cloudant.assertDesignDocument();
  const database = await cloudant.buildDatabase(new DatabaseWritable());

  const changesWritableParams = await run(cloudant, database);
  changesWritableParams.run = run.bind(undefined, cloudant);
  await cloudant.followChanges(new ChangesWritable(changesWritableParams));
}
