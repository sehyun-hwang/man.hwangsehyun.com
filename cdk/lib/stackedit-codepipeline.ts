/* eslint-disable max-classes-per-file */
import type { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { ReadWriteType, Trail } from 'aws-cdk-lib/aws-cloudtrail';
import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import {
  CloudFormationCreateUpdateStackAction,
  CodeBuildAction, CodeStarConnectionsSourceAction, ManualApprovalAction,
  S3DeployAction, S3SourceAction, S3Trigger,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import type { Asset } from 'aws-cdk-lib/aws-s3-assets';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

import type CloudFrontStack from './cloudfront';
import {
  codeStarConnectionsSourceActionProps, CONTENT_KEY, TEMPLATE_PATH,
} from './config';
import { HugoBuildPipeline } from './stackedit';

export const CONTENT_CACHE_IDENTIFIER = 'content_cache';

interface StackEditCodePipelineStackProps extends cdk.StackProps {
  hugoImage: cdk.DockerImage;
  artifactsBucket: Bucket;
  devCloudFrontStack: CloudFrontStack;
  prodCloudFrontStack: CloudFrontStack;
}

export default class StackEditCodePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackEditCodePipelineStackProps) {
    super(scope, id, props);
    const { artifactsBucket: bucket } = props;

    const sourceArtifact = new Artifact();
    const contentArtifact = new Artifact();
    const templateArtifact = new Artifact();
    const cloudFrontStacks = {
      Dev: props.devCloudFrontStack,
      Prod: props.prodCloudFrontStack,
    };
    const { hugoImage } = props;
    const { pipelineProject } = new HugoBuildPipeline(this, 'HugoBuildPipeline', {
      hugoImage,
    });

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

    const buildDeploy = (stage: 'Dev' | 'Prod') => ({
      stageName: 'Deploy' + stage,
      actions: [new S3DeployAction({
        actionName: 'S3DeployAction',
        extract: true,
        input: cloudFrontStacks[stage].publicArtifact,
        bucket: cloudFrontStacks[stage].deploymentBucket,
      }),
      new CloudFormationCreateUpdateStackAction({
        actionName: 'CloudFormationCreateUpdate',
        stackName: 'MyStackName-' + stage,
        adminPermissions: true,
        templatePath: templateArtifact.atPath(TEMPLATE_PATH),
        parameterOverrides: {
          BucketArnParameter: cloudFrontStacks[stage].deploymentBucket.bucketArn,
        },
      })],
    });

    this.pipeline = new Pipeline(this, 'Pipeline', {
      pipelineType: PipelineType.V2,
      artifactBucket: bucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            gitHubSourceAction,
            new S3SourceAction({
              actionName: 'S3Source',
              bucketKey: CONTENT_KEY,
              bucket,
              output: contentArtifact,
              trigger: S3Trigger.EVENTS,
            }),
            new S3SourceAction({
              actionName: 'CloudFormationTemplateS3SourceAction',
              bucketKey: cloudFrontStacks.Dev.templateAsset.s3ObjectKey,
              bucket: cloudFrontStacks.Dev.templateAsset.bucket,
              output: templateArtifact,
              trigger: S3Trigger.NONE,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [new CodeBuildAction({
            actionName: 'BuildDev',
            project: pipelineProject,
            input: sourceArtifact,
            extraInputs: [contentArtifact],
            outputs: [cloudFrontStacks.Dev.publicArtifact],
            environmentVariables: {},
          }), new CodeBuildAction({
            actionName: 'BuildProd',
            project: pipelineProject,
            input: sourceArtifact,
            extraInputs: [contentArtifact],
            outputs: [cloudFrontStacks.Prod.publicArtifact],
            environmentVariables: {},
          })],
        },
        buildDeploy('Dev'),
        {
          stageName: 'Approval',
          actions: [new ManualApprovalAction({
            actionName: 'ApprovalTest',
          })],
        },
        buildDeploy('Prod'),
      ],
    });
  }
}
