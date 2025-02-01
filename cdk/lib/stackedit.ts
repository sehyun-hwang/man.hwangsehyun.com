/* eslint-disable max-classes-per-file */
import { EventbridgeToStepfunctions } from '@aws-solutions-constructs/aws-eventbridge-stepfunctions';
import {
  Artifacts, BuildSpec, CfnProject, ComputeType, IBuildImage, ImagePullPrincipalType,
  LinuxArmLambdaBuildImage, Project, ReportGroup, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { type IRepository, Repository } from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Schedule } from 'aws-cdk-lib/aws-events';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source as S3Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { DefinitionBody, FieldUtils, IntegrationPattern } from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService, CodeBuildStartBuild } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as cdk from 'aws-cdk-lib/core';
import * as ecrdeploy from 'cdk-ecr-deployment';
import { Construct } from 'constructs';

// @ts-expect-error Private constructor
class EcrLinuxArmLambdaBuildImage extends LinuxArmLambdaBuildImage implements IBuildImage {
  readonly imagePullPrincipalType: ImagePullPrincipalType;

  readonly repository: IRepository;

  constructor({ repository, dest }: { repository: IRepository, dest: string }) {
    // @ts-expect-error Private constructor
    super({
      imageId: dest,
    });
    this.imagePullPrincipalType = ImagePullPrincipalType.SERVICE_ROLE;
    this.repository = repository;
  }
}

// https://github.com/aws/aws-cdk/blob/v2.177.0/packages/aws-cdk-lib/aws-stepfunctions-tasks/lib/private/task-utils.ts

const resourceArnSuffix: Record<IntegrationPattern, string> = {
  [IntegrationPattern.REQUEST_RESPONSE]: '',
  [IntegrationPattern.RUN_JOB]: '.sync',
  [IntegrationPattern.WAIT_FOR_TASK_TOKEN]: '.waitForTaskToken',
};

function integrationResourceArn(
  service: string,
  api: string,
  integrationPattern?: IntegrationPattern,
) {
  if (!service || !api) {
    throw new Error('Both \'service\' and \'api\' must be provided to build the resource ARN.');
  }
  return `arn:${cdk.Aws.PARTITION}:states:::${service}:${api}`
    + (integrationPattern ? resourceArnSuffix[integrationPattern] : '');
}

// https://github.com/aws/aws-cdk/issues/10302
class OverridableCodeBuildStartBuild extends CodeBuildStartBuild {
  protected override _renderTask(): object {
    return {
      Resource: integrationResourceArn('codebuild', 'startBuild', this.integrationPattern),
      Parameters: FieldUtils.renderObject({
        ProjectName: this.props.project.projectName,
        EnvironmentVariablesOverride: this.props.environmentVariablesOverride
          ? this.serializeEnvVariables(this.props.environmentVariablesOverride)
          : undefined,
        ...(this.props.overrides || {}),
      }),
    };
  }
}

interface StackEditStackProps extends cdk.StackProps {
  nodeModulesImage: cdk.DockerImage;
}

export default class StackEditStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackEditStackProps) {
    super(scope, id, props);

    const buildImageAsset = new DockerImageAsset(this, 'CodeBuildImage', {
      directory: '../src',
      buildArgs: {
        NODE_MODULES_IMAGE: props.nodeModulesImage.image,
      },
    });

    const repository = new Repository(this, 'Repository');
    const ecrDeploymentDest = repository.repositoryUri + ':' + buildImageAsset.assetHash;
    const ecrDeployment = new ecrdeploy.ECRDeployment(this, 'DeployDockerImage', {
      src: new ecrdeploy.DockerImageName(buildImageAsset.imageUri),
      dest: new ecrdeploy.DockerImageName(ecrDeploymentDest),
    });
    const buildImage = new EcrLinuxArmLambdaBuildImage({
      repository,
      dest: ecrDeploymentDest,
    });

    const bucket = new Bucket(this, 'ArtifactBucket');
    const bucketDeployment = new BucketDeployment(this, 'EmptyCache', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'empty',
      sources: [S3Source.data('placeholder.txt', '')],
    });

    const secret = Secret.fromSecretCompleteArn(this, 'Secret', 'arn:aws:secretsmanager:ap-northeast-1:248837585826:secret:man.hwangsehyun.com-Wk9Cto');
    const buildSpecSecrets = {
      // HUGO_PARAMS_MICROCMS_KEY: secret.secretArn + ':HUGO_PARAMS_MICROCMS_KEY',
      CLOUDANT_APIKEY: secret.secretArn + ':CLOUDANT_APIKEY',
    };
    const reportGroup = new ReportGroup(this, 'ReportGroup');

    const codebuildProject = new Project(this, 'Project', {
      environment: {
        buildImage,
        computeType: ComputeType.LAMBDA_1GB,
      },
      source: Source.gitHub({
        identifier: 'src',
        owner: 'sehyun-hwang',
        repo: 'man.hwangsehyun.com',
        branchOrRef: '31-cdk-codebuild',
      }),
      secondarySources: [Source.s3({
        identifier: 'content_cache',
        bucket,
        path: 'empty/',
      })],
      buildSpec: BuildSpec.fromObject({
        version: 0.2,
        env: {
          variables: {
            CI: 'true',
          },
          'secrets-manager': buildSpecSecrets,
        },
        phases: {
          pre_build: {
            commands: [
              `env ${Object.keys(buildSpecSecrets).map(x => `-u ${x}`).join(' ')}`,
              'ln -sv /cofa_lambda_docker_build/stackedit-prod/node_modules src/node_modules',
              'cp -rv $CODEBUILD_SRC_DIR_content_cache content',
            ],
          },
          build: {
            commands: [
              'node src',
            ],
          },
        },
        artifacts: {
          name: 'content',
          'base-directory': 'content',
          files: ['**/*'],
          'exclude-paths': '**/*.gz',
        },
        reports: {
          [reportGroup.reportGroupArn]: {
            files: 'public/junit.xml',
          },
        },
      }),
      artifacts: Artifacts.s3({
        bucket,
        packageZip: false,
      }),
    });
    repository.grantPull(codebuildProject);
    secret.grantRead(codebuildProject);

    /** @link https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ListReportsForReportGroup.html */
    const listReportsTask = new CallAwsService(this, 'ListReportsTask', {
      service: 'codebuild',
      action: 'listReportsForReportGroup',
      parameters: {
        MaxResults: 1,
        ReportGroupArn: reportGroup.reportGroupArn,
      },
      iamResources: [codebuildProject.projectArn],
    });

    /** @link https://docs.aws.amazon.com/step-functions/latest/dg/connect-codebuild.html#:~:text=%3A*%3Aproject/*%22%0A%20%20%20%20%20%20%5D%0A%20%20%20%20%7D%0A%20%20%5D%0A%7D-,BatchGetReports,-Static%20resources */
    const batchGetReportsTask = new CallAwsService(this, 'BatchGetReportsTask', {
      service: 'codebuild',
      action: 'listReportsForReportGroup',
      parameters: {
        ReportArns: [],
      },
      iamResources: [reportGroup.reportGroupArn],
    });

    const startBuildTask = new OverridableCodeBuildStartBuild(this, 'StartBuildTask', {
      project: codebuildProject,
      integrationPattern: IntegrationPattern.RUN_JOB,
      // @ts-expect-error Deliberate
      overrides: {
        SecondarySourcesOverride: [{
          Type: 'S3',
          Location: bucket.bucketName + '/foo',
          SourceIdentifier: 'content_cache',
        }],
      },
    });

    const taskChain = startBuildTask
      .next(listReportsTask)
      .next(batchGetReportsTask);

    const eventBridgeToStepFunctions = new EventbridgeToStepfunctions(this, 'EventbridgeToStepFunctions', {
      stateMachineProps: {
        definitionBody: DefinitionBody.fromChainable(taskChain),
      },
      eventRuleProps: {
        schedule: Schedule.rate(cdk.Duration.minutes(1)),
      },
    });

    (eventBridgeToStepFunctions.stateMachineLogGroup.node.defaultChild as cdk.CfnResource)
      .applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    (codebuildProject.node.defaultChild as CfnProject).addPropertyOverride('Environment.ImagePullCredentialsType', ImagePullPrincipalType.SERVICE_ROLE);
  }
}
