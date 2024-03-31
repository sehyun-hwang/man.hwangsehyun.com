// @ts-check

import { strict as assert } from 'assert';
import { pipeline } from 'stream/promises';

import { ChangesFollower, CloudantV1 } from '@ibm-cloud/cloudant';
import Pick from 'stream-json/filters/Pick.js';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import parser from 'stream-json';

import { frontmatterMap } from './view-function.js';

export const FRONTMATTER_PREFIX = 'frontmatter.';

const db = 'stackedit';
const ddoc = 'hugo';
const VIEW_NAME = 'frontmatter';

export default class Cloudant4Hugo {
  /** @constant */
  constants = {
    db,
    ddoc,
    VIEW_NAME,
  };

  /** @param {import('ibm-cloud-sdk-core').UserOptions} params */
  constructor(params) {
    this.client = CloudantV1.newInstance(params);
  }

  async assertDesignDocument() {
    const {
      result: {
        _rev,
        ...designDocument
      },
    } = await this.client.getDesignDocument({
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
   * @param {import('./database.js').default} databaseWritable
   */
  async buildDatabase(databaseWritable) {
    await this.client.postViewAsStream({
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
    console.log('Total contents:', databaseWritable.etagFromId.size);
    return databaseWritable;
  }

  fetchDomData() {
    return this.client.postFind({
      db,
      selector: {
        item: {
          type: {
            $in: ['folder', 'file'],
          },
          parentId: {
            $ne: 'trash',
          },
        },
      },
    })
      .then(({ result: { warning, docs } }) => {
        console.log('Cloudant index warning:', warning);
        return docs;
      });
  }

  /**
   * @param {import('stream').Writable} writable
   */
  streamFrontMatters(writable) {
    return this.client.postAllDocsAsStream({
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
        writable,
      ));
  }

  /**
  * @param {import('./path.js').default[]} stackEditPaths
  */
  async downloadMarkdownsBatch(stackEditPaths) {
    const gathered = await Promise.all(stackEditPaths.flatMap(path => [
      this.client.getAttachment({
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

  /**
   * @param {import('stream').Writable} writable
   */
  followChanges(writable) {
    const changesFollower = new ChangesFollower(this.client, {
      db,
      includeDocs: true,
    });
    const endPromise = pipeline(changesFollower.start(), writable);
    console.log('Following changes in db', db);
    return endPromise;
  }
}
