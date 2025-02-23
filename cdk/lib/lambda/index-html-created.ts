/* eslint-disable import/prefer-default-export */
import { glob } from 'fs/promises';

import { S3EventNotificationEventBridgeSchema } from '@aws-lambda-powertools/parser/schemas';
import type { EventBridgeEvent } from '@aws-lambda-powertools/parser/types';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Context } from 'aws-lambda';

const s3 = new S3Client();

function copyObject(copySource: {
  bucket: string;
  key: string;
}) {
  return s3.send(new CopyObjectCommand({
    CopySource: `${copySource.bucket}/${copySource.key}`,
    Bucket: copySource.bucket,
    Key: copySource.key.replace(/index\.html$/, ''),
  }));
}

export function handler(
  eventBridgeEvent: EventBridgeEvent,
  context: Context,
) {
  console.log(eventBridgeEvent, context);
  const event = S3EventNotificationEventBridgeSchema.parse(eventBridgeEvent);
  const {
    bucket: { name: bucket },
    object: { key },
  } = event.detail;
  return copyObject({ bucket, key });
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
