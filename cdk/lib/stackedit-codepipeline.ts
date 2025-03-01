import { ReadWriteType, Trail } from 'aws-cdk-lib/aws-cloudtrail';
import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction, CodeStarConnectionsSourceAction, ManualApprovalAction, S3SourceAction, S3Trigger,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import type { Bucket } from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

import { codeStarConnectionsSourceActionProps, CONTENT_KEY } from './config';
import { HugoBuildPipeline } from './stackedit';

export const CONTENT_CACHE_IDENTIFIER = 'content_cache';

interface StackEditCodePipelineStackProps extends cdk.StackProps {
  hugoImage: cdk.DockerImage;
  deploymentBucket: Bucket;
}

export default class StackEditCodePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackEditCodePipelineStackProps) {
    super(scope, id, props);
    const bucket = props.deploymentBucket;

    const sourceArtifact = new Artifact();
    const contentArtifact = new Artifact();

    const gitHubSourceAction = new CodeStarConnectionsSourceAction({
      ...codeStarConnectionsSourceActionProps,
      output: sourceArtifact,
    });

    const trail = new Trail(this, 'CloudTrail');
    trail.addS3EventSelector([{
      bucket,
      objectPrefix: CONTENT_KEY,
    }], {
      readWriteType: ReadWriteType.WRITE_ONLY,
    });
    const s3SourceAction = new S3SourceAction({
      actionName: 'S3Source',
      bucketKey: CONTENT_KEY,
      bucket,
      output: contentArtifact,
      trigger: S3Trigger.EVENTS,
    });

    const { hugoImage } = props;
    const { pipelineProject } = new HugoBuildPipeline(this, 'HugoBuildPipeline', {
      hugoImage,
    });

    const pipeline = new Pipeline(this, 'Pipeline', {
      pipelineType: PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [gitHubSourceAction, s3SourceAction],
        },
        {
          stageName: 'HugoBuild',
          actions: [new CodeBuildAction({
            actionName: 'HugoBuild',
            project: pipelineProject,
            input: sourceArtifact,
            extraInputs: [contentArtifact],
          })],
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
