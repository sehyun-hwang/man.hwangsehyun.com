import { Writable } from 'stream';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

import { ChangesFollower, CloudantV1 } from '@ibm-cloud/cloudant';

const client = CloudantV1.newInstance({
  serviceUrl: 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com',
});
const db = 'stackedit';

const FRONTMATTER_PREFIX = 'frontmatter.';
const query = {
  startkey: JSON.stringify(FRONTMATTER_PREFIX),
  endkey: JSON.stringify(FRONTMATTER_PREFIX + '\ufff0'),
};
console.log(query);

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

console.log('Following changes in db ', db);
