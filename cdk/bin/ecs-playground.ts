#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, createReadStream } from 'fs';
import { strict as assert } from 'node:assert';
import { glob } from 'node:fs/promises';

import * as cdk from 'aws-cdk-lib';
import { DockerfileParser } from 'dockerfile-ast';

import StackEditStack from '../lib/stackedit';

// eslint-disable-next-line dot-notation
const DOCKER_EXECUTABLE = process.env['CDK_DOCKER'] ?? 'docker';
const CONTAINER_NAME = 'cdk-man-hwangsehyun-com-node-modules';

async function buildNodeModulesImage() {
  const assetPaths = DockerfileParser.parse(readFileSync('../Dockerfile', 'utf-8')).getCOPYs()
    .flatMap(x => x.getArguments())
    .map(x => x.getValue())
    .slice(0, -1);
  assetPaths.push('../Dockerfile');

  const hash = createHash('md5');

  // eslint-disable-next-line no-restricted-syntax
  for await (const assetPath of glob(assetPaths)) {
    hash.update(assetPath);
    const stream = createReadStream(assetPath);
    stream.on('data', chunk => hash.update(chunk));
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => { resolve(); });
      stream.on('error', error => { reject(error); });
    });
  }

  const digest = hash.digest('hex');
  const tag = CONTAINER_NAME + ':' + digest;
  const { stdout } = spawnSync(DOCKER_EXECUTABLE, ['image', 'inspect', tag]);
  const image = new cdk.DockerImage(tag, digest);
  if (stdout.length)
    return image;

  spawnSync(DOCKER_EXECUTABLE, ['build', '..', '-t', tag], {
    stdio: [ // show Docker output
      'ignore', // ignore stdin
      process.stderr, // redirect stdout to stderr
      'inherit', // inherit stderr
    ],
  });
  return image;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const nodeModulesImage = await buildNodeModulesImage();

new StackEditStack(app, 'StackEditStack', {
  env,
  nodeModulesImage,
});
