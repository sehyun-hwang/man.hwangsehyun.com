// @ts-check

import { writeFile } from 'fs/promises';

import { insertFrontMatterDocs, processFrontMatters } from './frontmatter.js';
import ChangesWritable from './changes.js';
import Cloudant4Hugo from './cloudant.js';
import DatabaseWritable from './database.js';
import FileSynchronizer from './file-sync.js';
import StackEditDomData from './dom-data.js';
import StackEditDomModel from './dom-model.js';
import StackEditPath, { HUGO_CONTENT_DIR } from './path.js';

const staticCloudant = new Cloudant4Hugo({
  serviceUrl: 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com',
});

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
    && await insertFrontMatterDocs(
      cloudant.client,
      cloudant.constants.db,
      database.missingFrontmatterDocs,
    )
      .then(length => {
        console.log('Parsed frontmatter inserted', length);
        // eslint-disable-next-line no-param-reassign
        database.missingFrontmatterDocs = [];
      });
  // throw new Error();

  const domData = new StackEditDomData(await cloudant.fetchDomData());
  const domModel = new StackEditDomModel(domData.sortNodes());
  console.log(domModel.html);
  domData.assignDocId(domModel.assignDocId.bind(domModel));
  console.log(domModel.html);
  domModel.assignData(database.bidirectionalMap, database.etagFromId);
  console.log(domModel.html);

  const frontmatterDocs = frontMatterDocsArg
    || await processFrontMatters(cloudant, database.bidirectionalMap);
  // console.log(database);

  frontmatterDocs.forEach(docs => {
    domModel.appendFrontmatter(docs);
  });
  await writeFile('static/tree.html', domModel.html);

  const stackEditPaths = domData.files.map(({ item: { id } }) => {
    const names = domModel.getNamesFromId(id);
    const { etag, contentid: contentId } = domModel.getDatasetFromId(id);
    return new StackEditPath({ names, contentId, etag });
  });

  const synchronizer = new FileSynchronizer(stackEditPaths);
  await synchronizer.writeHugoConfig();
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
  process.env.CI || await cloudant.followChanges(new ChangesWritable(changesWritableParams));
}
