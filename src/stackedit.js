import { createWriteStream } from 'fs';

import Nano from 'nano';

const COUCHDB_URL = 'https://618cf517-eb22-487f-ab2c-8366988f9b91-bluemix.cloudant.com';
const COUCHDB_USER = 'apikey-v2-1ou4ojg2gc14j0226kljqrif72kclxwj5eu5hvxb7hgd';
const COUCHDB_DB = 'stackedit';

const nano = Nano('https://2byvg7kuok.execute-api.ap-northeast-1.amazonaws.com');
await nano.auth(COUCHDB_USER, process.env.COUCHDB_PASSWORD);

console.log('Authenticated to couchdb as', COUCHDB_USER);

const db = nano.db.use('stackedit');

db.changesReader.start({
  timeout: 29000,
  includeDocs: true,
})
  .on('change', change => {
    console.log(change);
    const { id, doc: { time } } = change;
    const date = new Date(time);
    console.log({ id, date });

    db.attachment.getAsStream(id, 'data')
      .pipe(createWriteStream('content/about.md'));
  })
  .on('batch', b => {
    console.log('a batch of', b.length, 'changes has arrived');
  }).on('seq', s => {
    console.log('sequence token', s);
  })
  .on('error', e => {
    console.error('error', e);
  });
