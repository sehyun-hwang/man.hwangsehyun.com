/* eslint-disable import/prefer-default-export */
import { glob } from 'fs/promises';

import { S3Schema } from '@aws-lambda-powertools/parser/schemas';
import type { EventBridgeEvent } from '@aws-lambda-powertools/parser/types';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Context } from 'aws-lambda';

const s3 = new S3Client();

function copyObject(copySource: {
  bucket: string;
  key: string;
}) {
  if (copySource.key === 'index.html') {
    console.log('Skipping index.html');
    return Promise.resolve();
  }
  const destinationKey = copySource.key.replace(/index\.html$/, '');
  console.log('Copying', copySource, destinationKey);
  return s3.send(new CopyObjectCommand({
    CopySource: `${copySource.bucket}/${copySource.key}`,
    Bucket: copySource.bucket,
    Key: destinationKey,
  }));
}

export function handler(
  eventBridgeEvent: EventBridgeEvent,
  _context: Context,
) {
  const event = S3Schema.parse(eventBridgeEvent);
  console.log('event', JSON.stringify(event));
  return Promise.all(event.Records.map(({
    s3: {
      bucket: { name: bucket },
      object: { key },
    },
  }) => copyObject({ bucket, key })));
}

// await (async () => {
//   // eslint-disable-next-line no-restricted-syntax
//   for await (const file of glob('public/**/index.html')) {
//     const key = file.replace(/^public\//, '');
//     console.log(file, key);
//     await copyObject({
//       bucket: 'man.hwangsehyun.com',
//       key,
//     });
//   }
// })();
