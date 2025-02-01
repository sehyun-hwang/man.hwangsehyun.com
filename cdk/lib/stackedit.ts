/* eslint-disable max-classes-per-file */
import {
  Artifacts, BuildSpec, CfnProject, ComputeType, IBuildImage, ImagePullPrincipalType,
  LinuxArmLambdaBuildImage, Project, ReportGroup, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { type IRepository, Repository } from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source as S3Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib/core';
import * as ecrdeploy from 'cdk-ecr-deployment';
import { Construct } from 'constructs';

export const CONTENT_CACHE_IDENTIFIER = 'content_cache';

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

interface StackEditStackProps extends cdk.StackProps {
  nodeModulesImage: cdk.DockerImage;
}

export interface IStackEditStack {
  artifactsBucket: Bucket;
  codeBuildProject: Project;
  reportGroup: ReportGroup;
}

export default class StackEditStack extends cdk.Stack implements IStackEditStack {
  exports: IStackEditStack;

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
      destinationKeyPrefix: 'empty/content',
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
        path: 'empty/content/',
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
              'cp -rv $CODEBUILD_SRC_DIR_content_cache/content content',
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
    reportGroup.grantWrite(codebuildProject);

    (codebuildProject.node.defaultChild as CfnProject).addPropertyOverride('Environment.ImagePullCredentialsType', ImagePullPrincipalType.SERVICE_ROLE);

    this.exports = {
      artifactsBucket: bucket,
      codeBuildProject: codebuildProject,
      reportGroup,
    };
  }
}
