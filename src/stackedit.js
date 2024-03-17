import { Writable } from 'stream';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

import { ChangesFollower, CloudantV1 } from '@ibm-cloud/cloudant';
import Pick from 'stream-json/filters/Pick.js';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import parser from 'stream-json';

const client = CloudantV1.newInstance({
  serviceUrl: 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com',
});
const db = 'stackedit';

const FRONTMATTER_PREFIX = 'frontmatter.';
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
