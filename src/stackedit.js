/* eslint-disable max-classes-per-file */
import { Writable } from 'stream';
import { strict as assert } from 'assert';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { text } from 'node:stream/consumers';

import { ChangesFollower, CloudantV1 } from '@ibm-cloud/cloudant';
import Pick from 'stream-json/filters/Pick.js';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import parser from 'stream-json';

import { frontmatterMap } from './view-function.js';
import { parseFrontMatters } from './markdownlint.js';

const client = CloudantV1.newInstance({
  serviceUrl: 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com',
});
const db = 'stackedit';
const ddoc = 'hugo';
const VIEW_NAME = 'frontmatter';

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

class MissingFrontmatterFilterWritable extends Writable {
  prev = null;

  constructor() {
    super({ objectMode: true });
    this.missingFrontmatterDocs = [];
  }

  // eslint-disable-next-line class-methods-use-this
  _write(data, encoding, callback) {
    // console.log(data);
    const { prev } = this;
    this.prev = data;

    data.value.doc || this.missingFrontmatterDocs.push(prev.value.doc);
    return callback();
  }
}

/*
{
  key: 0,
  value: {
    id: '8fd6776b79dde459ab2ba635c9b75eab',
    key: [ '8fd6776b79dde459ab2ba635c9b75eab', 0 ],
    value: {
      id: 'ZIg3BhlkY0gYHgDH/content',
      type: 'content',
      hash: -367382062
    },
    doc: {
      _id: '8fd6776b79dde459ab2ba635c9b75eab',
      _rev: '6-190b09dd7912cfc1b0237c9b4c29ed79',
      item: [Object],
      time: 1710607697528,
      sub: 'go:112316266778963098909',
      _attachments: [Object]
    }
  }
}
{
  key: 1,
  value: {
    id: '8fd6776b79dde459ab2ba635c9b75eab',
    key: [ '8fd6776b79dde459ab2ba635c9b75eab', 1 ],
    value: { _id: 'frontmatter.-367382062' },
    doc: null
  }
}
*/
const missingFrontmatterFilterWritable = new MissingFrontmatterFilterWritable();

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
    missingFrontmatterFilterWritable,
  ));

const { missingFrontmatterDocs } = missingFrontmatterFilterWritable;
console.log('Parsed frontmatter missing in DB', missingFrontmatterDocs.length);

const attachmentsByDocId = Object.fromEntries(
  await Promise.all(missingFrontmatterDocs.map(({
    _id: docId,
    item: { hash },
  }) => client.getAttachment({
    db,
    docId,
    attachmentName: 'data',
  })
    .then(async ({ result }) => [hash.toString(), await text(result)]))),
);

const FRONTMATTER_PREFIX = 'frontmatter.';
const frontMatterBulkDocs = await parseFrontMatters(attachmentsByDocId, FRONTMATTER_PREFIX);
console.log('Inserting bulk docs of frontmatters', frontMatterBulkDocs);

await client.postBulkDocs({
  db,
  bulkDocs: { docs: frontMatterBulkDocs },
})
  .then(({ result }) => console.log('Parsed frontmatter inserted:', result.length));

// throw new Error();

const allDocs = await client.postAllDocsAsStream({
  db,
  startKey: FRONTMATTER_PREFIX,
  endKey: FRONTMATTER_PREFIX + '\ufff0',
  includeDocs: true,
})
  .then(response => pipeline(
    response.result,
    parser(),
    new Pick({ filter: 'rows' }),
    new StreamArray(),
    new Writable({
      objectMode: true,
      write(data, encoding, callback) {
        console.log(data);
        callback();
      },
    }),
  ));

console.log(allDocs);

const changesFollower = new ChangesFollower(client, {
  db,
  includeDocs: true,
});

class ChangesWritable extends Writable {
  constructor() {
    super({ objectMode: true });
  }

  // eslint-disable-next-line class-methods-use-this
  _write({ id: docId, changes, doc: { time } }, _, callback) {
    console.log(docId, changes);
    const date = new Date(time);
    console.log({ docId, date });

    client.getAttachment({
      db,
      docId,
      attachmentName: 'data',
    })
      .pipe(createWriteStream('content/about.md'));

    callback();
  }
}

pipeline(changesFollower.start(), new ChangesWritable())
  .catch(err => {
    console.log(err);
  });

console.log('Following changes in db', db);
