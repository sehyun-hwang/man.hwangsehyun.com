import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import { CodeStarConnectionsSourceAction, ManualApprovalAction, S3SourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import { codeStarConnectionsSourceActionProps } from './config';

export const CONTENT_CACHE_IDENTIFIER = 'content_cache';

interface StackEditCodePipelineStackProps extends cdk.StackProps {
  hugoImage: cdk.DockerImage;
}

export default class StackEditCodePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackEditCodePipelineStackProps) {
    super(scope, id, props);

    const assetLocation = this.synthesizer.addDockerImageAsset({
      sourceHash: props.hugoImage.toJSON(),
      executable: ['echo', props.hugoImage.image],
    });
    console.log('asset', assetLocation);

    const sourceOutput = new Artifact();
    const sourceOutput2 = new Artifact();

    const gitHubSourceAction = new CodeStarConnectionsSourceAction({
      ...codeStarConnectionsSourceActionProps,
      output: sourceOutput,
    });
    const bucket = new Bucket(this, 'DeploymentBucket', {
      versioned: true,
    });

    const s3SourceAction = new S3SourceAction({
      actionName: 'S3Source',
      bucketKey: 'CloudformationSchema.zip',
      bucket,
      output: sourceOutput2,
    });

    const pipeline = new Pipeline(this, 'Pipeline', {
      pipelineType: PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [gitHubSourceAction, s3SourceAction],
        },
        {
          stageName: 'Approval',
          actions: [new ManualApprovalAction({
            actionName: 'ApprovalTest',
          })],
        },
      ],
    });
  }
}
