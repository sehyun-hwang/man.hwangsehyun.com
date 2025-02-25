#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream, readFileSync } from 'fs';
import { glob } from 'node:fs/promises';

import * as cdk from 'aws-cdk-lib';
import { DockerfileParser } from 'dockerfile-ast';

import CloudFrontStack from '../lib/cloudfront';
import StackEditStack from '../lib/stackedit';
import StackEditCodePipelineStack from '../lib/stackedit-codepipeline';
import StackEditStepFunctionsStack from '../lib/stackedit-stepfunctions';

// eslint-disable-next-line dot-notation
const DOCKER_EXECUTABLE = process.env['CDK_DOCKER'] ?? 'docker';
const CONTAINER_NAME = 'cdk-man-hwangsehyun-com-node-modules';

async function buildNodeModulesImage() {
  const assetPaths = DockerfileParser.parse(readFileSync('../Dockerfile', 'utf-8')).getCOPYs()
    .flatMap(x => (x.getFlags().some(flag => flag.getName() === 'from')
      ? [] : x.getArguments()))
    .map(x => x.getValue())
    .slice(0, -1);
  assetPaths.push('../Dockerfile');

  const hash = createHash('md5');

  // eslint-disable-next-line no-restricted-syntax
  for await (const assetPath of glob(assetPaths)) {
    hash.update(assetPath);
    const stream = createReadStream(assetPath);
    stream.on('data', chunk => hash.update(chunk));

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => { resolve(); });
      stream.on('error', error => { reject(error); });
    });
  }

  const dockerBuildArgs = ['build', '..', '--platform', 'linux/amd64', '-t'];
  dockerBuildArgs.forEach(arg => hash.update(arg));
  const digest = hash.digest('hex');
  const tag = CONTAINER_NAME + ':' + digest;
  const { stdout } = spawnSync(DOCKER_EXECUTABLE, ['image', 'inspect', tag]);
  const image = new cdk.DockerImage(tag, digest);
  if (stdout.length)
    return image;

  const { status } = spawnSync(DOCKER_EXECUTABLE, [...dockerBuildArgs, tag], {
    stdio: [ // show Docker output
      'ignore', // ignore stdin
      process.stderr, // redirect stdout to stderr
      'inherit', // inherit stderr
    ],
  });
  if (status)
    throw new Error('spawnSync error');
  return image;
}

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '',
  region: process.env.CDK_DEFAULT_REGION || '',
};

const nodeModulesImage = await buildNodeModulesImage();

const stackEditStack = new StackEditStack(app, 'StackEditStack', {
  env,
  nodeModulesImage,
});

const devCloudFrontStack = new CloudFrontStack(app, 'CloudFrontStack-Dev', {
  env,
});
const prodCloudFrontStack = new CloudFrontStack(app, 'CloudFrontStack-Prod', {
  env,
  domainName: 'man2.hwangsehyun.com',
  forbiddenResponsePagePath: '/404.html',
});

const { artifactsBucket } = stackEditStack;
// eslint-disable-next-line no-new
new StackEditCodePipelineStack(app, 'StackEditCodePipelineStack', {
  env,
  hugoImage: nodeModulesImage,
  artifactsBucket,
  devCloudFrontStack,
  prodCloudFrontStack,
});

// eslint-disable-next-line no-new
new StackEditStepFunctionsStack(app, 'BuildConnectorStepFunctionsStack', {
  env,
  ...stackEditStack.exports,
  srcBucket: artifactsBucket,
  destBucket: artifactsBucket,
});
