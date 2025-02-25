/* eslint-disable max-classes-per-file */
import { ReadWriteType, Trail } from 'aws-cdk-lib/aws-cloudtrail';
import { type BuildEnvironmentVariable, BuildEnvironmentVariableType } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import {
  CloudFormationCreateUpdateStackAction,
  CodeBuildAction, type CodeBuildActionProps, CodeStarConnectionsSourceAction,
  ManualApprovalAction, S3DeployAction, S3SourceAction,
  S3Trigger,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

import type CloudFrontStack from './cloudfront';
import { CloudFrontTemplateStackParameters } from './cloudfront';
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
  pipeline: Pipeline;

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

    const trail = new Trail(this, 'CloudTrail');
    trail.addS3EventSelector([{
      bucket,
      objectPrefix: CONTENT_KEY,
    }], {
      readWriteType: ReadWriteType.WRITE_ONLY,
    });

    const codeBuildActionProps: Omit<CodeBuildActionProps, 'actionName'> = {
      project: pipelineProject,
      input: sourceArtifact,
      extraInputs: [contentArtifact],
    };

    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    type CodeBuildEnvironmentVariables = {
      HUGO_BASEURL: BuildEnvironmentVariable;
      HUGO_PUBLISHDIR: BuildEnvironmentVariable;
      PDF_HTML_PATH: BuildEnvironmentVariable;
    };

    const emptyBucket = new Bucket(this, 'EmptyBucket', {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const buildDeploy = (stage: 'Dev' | 'Prod') => ({
      stageName: 'Deploy' + stage,
      actions: [new S3DeployAction({
        actionName: 'S3Deploy',
        extract: true,
        input: cloudFrontStacks[stage].publicArtifact,
        bucket: cloudFrontStacks[stage].deploymentBucket,
      }),
      new CloudFormationCreateUpdateStackAction({
        actionName: 'CloudFormationCreateUpdate',
        stackName: this.stackName + '-CloudFormation-' + stage,
        adminPermissions: true,
        templatePath: templateArtifact.atPath(TEMPLATE_PATH),
        parameterOverrides: ({
          DistributionIdParameter: cloudFrontStacks[stage].distribution.distributionId,
          DistributionDomainNameParameter: cloudFrontStacks[stage].domainName,
          BucketArnParameter: emptyBucket.bucketArn,
          ...(stage === 'Dev' ? { PipelineExecutionIdParameter: '#{codepipeline.PipelineExecutionId}' } : {}),
        }),
      })],
    });

    this.pipeline = new Pipeline(this, 'Pipeline', {
      pipelineType: PipelineType.V2,
      artifactBucket: bucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new CodeStarConnectionsSourceAction({
              ...codeStarConnectionsSourceActionProps,
              output: sourceArtifact,
            }),
            new S3SourceAction({
              actionName: 'S3Source',
              bucketKey: CONTENT_KEY,
              bucket,
              output: contentArtifact,
              trigger: S3Trigger.EVENTS,
            }),
            new S3SourceAction({
              actionName: 'CloudFormationTemplateS3Source',
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
            ...codeBuildActionProps,
            actionName: 'BuildDev',
            outputs: [cloudFrontStacks.Dev.publicArtifact],
            environmentVariables: {
              HUGO_BASEURL: {
                type: BuildEnvironmentVariableType.PLAINTEXT,
                value: `https://${cloudFrontStacks.Dev.domainName}/#{codepipeline.PipelineExecutionId}`,
              },
              HUGO_PUBLISHDIR: {
                type: BuildEnvironmentVariableType.PLAINTEXT,
                value: 'public/#{codepipeline.PipelineExecutionId}',
              },
              PDF_HTML_PATH: {
                type: BuildEnvironmentVariableType.PLAINTEXT,
                value: '/#{codepipeline.PipelineExecutionId}/all/',
              },
            } as CodeBuildEnvironmentVariables,
          }),
          new CodeBuildAction({
            ...codeBuildActionProps,
            actionName: 'BuildProd',
            outputs: [cloudFrontStacks.Prod.publicArtifact],
            environmentVariables: {
              HUGO_BASEURL: {
                type: BuildEnvironmentVariableType.PLAINTEXT,
                value: 'https://' + cloudFrontStacks.Prod.domainName,
              },
              HUGO_PUBLISHDIR: {
                type: BuildEnvironmentVariableType.PLAINTEXT,
                value: 'public',
              },
              PDF_HTML_PATH: {
                type: BuildEnvironmentVariableType.PLAINTEXT,
                value: '/all/',
              },
            } as CodeBuildEnvironmentVariables,
          })],
        },
        buildDeploy('Dev'),
        {
          stageName: 'Approval',
          actions: [new ManualApprovalAction({
            actionName: 'ManualApproval',
          })],
        },
        buildDeploy('Prod'),
      ],
    });
  }
}
