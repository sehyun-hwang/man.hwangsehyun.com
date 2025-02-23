/* eslint-disable max-classes-per-file */
import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction, CodeStarConnectionsSourceAction, ManualApprovalAction,
  S3SourceAction, S3Trigger,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Bucket, type CfnBucket, type IBucket } from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

import { codeStarConnectionsSourceActionProps, CONTENT_KEY, TEMPLATE_KEY } from './config';
import { HugoBuildPipeline } from './stackedit';

export const CONTENT_CACHE_IDENTIFIER = 'content_cache';

interface StackEditCodePipelineStackProps extends cdk.StackProps {
  hugoImage: cdk.DockerImage;
  deploymentBucket: Bucket;
  artifactsBucket: Bucket;
}

export default class StackEditCodePipelineStack extends cdk.Stack {
  pipelineBucket: IBucket;

  constructor(scope: Construct, id: string, props: StackEditCodePipelineStackProps) {
    super(scope, id, props);
    const { deploymentBucket } = props;

    const sourceArtifact = new Artifact();
    const contentArtifact = new Artifact();
    const publicArtifact = new Artifact();
    const templateArtifact = new Artifact();

    const { hugoImage } = props;
    const { pipelineProject } = new HugoBuildPipeline(this, 'HugoBuildPipeline', {
      hugoImage,
    });

    const gitHubSourceAction = new CodeStarConnectionsSourceAction({
      ...codeStarConnectionsSourceActionProps,
      output: sourceArtifact,
    });

    const pipeline = new Pipeline(this, 'Pipeline', {
      pipelineType: PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            gitHubSourceAction,
            new S3SourceAction({
              actionName: 'CloudFormationTemplateS3SourceAction',
              bucketKey: TEMPLATE_KEY,
              bucket: props.artifactsBucket,
              output: templateArtifact,
              trigger: S3Trigger.NONE,
            })],
        },
        {
          stageName: 'Build',
          actions: [new CodeBuildAction({
            actionName: 'Build',
            project: pipelineProject,
            input: sourceArtifact,
            extraInputs: [contentArtifact],
            outputs: [publicArtifact],
          })],
        },
        // {
        //   stageName: 'S3Deploy',
        //   actions: [new S3DeployAction({
        //     actionName: 'S3DeployAction',
        //     extract: true,
        //     input: publicArtifact,
        //     bucket: deploymentBucket,
        //   })],
        // },
        {
          stageName: 'Approval',
          actions: [new ManualApprovalAction({
            actionName: 'ApprovalTest',
          })],
        },
      ],
    });

    const bucket = pipeline.artifactBucket;
    this.pipelineBucket = bucket;
    (bucket.node.defaultChild as CfnBucket)
      .versioningConfiguration = { status: 'Enabled' };

    pipeline.stage('Source').addAction(new S3SourceAction({
      actionName: 'S3Source',
      bucketKey: CONTENT_KEY,
      bucket,
      output: contentArtifact,
      trigger: S3Trigger.EVENTS,
    }));
  }
}
