/* eslint-disable max-classes-per-file */
import {
  Artifacts, BuildSpec, Cache, CfnProject, ComputeType, IBuildImage, ImagePullPrincipalType,
  LinuxArmLambdaBuildImage, LocalCacheMode, PipelineProject, Project, ReportGroup, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { type IRepository, Repository } from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source as S3Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import { gitHubSourceProps } from './config';

export const CONTENT_CACHE_IDENTIFIER = 'content_cache';

// @ts-expect-error Private constructor
class EcrLinuxArmLambdaBuildImage extends LinuxArmLambdaBuildImage implements IBuildImage {
  readonly imagePullPrincipalType: ImagePullPrincipalType;

  readonly repository: IRepository;

  constructor(dockerImageAsset: DockerImageAsset) {
    // @ts-expect-error Private constructor
    super({
      imageId: dockerImageAsset.imageUri,
    });
    this.imagePullPrincipalType = ImagePullPrincipalType.SERVICE_ROLE;
    this.repository = dockerImageAsset.repository;
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

export default class StackEditStack extends cdk.Stack {
  exports: IStackEditStack;

  constructor(scope: Construct, id: string, props: StackEditStackProps) {
    super(scope, id, props);

    const buildImageAsset = new DockerImageAsset(this, 'CodeBuildImage', {
      directory: '../src',
      buildArgs: {
        NODE_MODULES_IMAGE: props.nodeModulesImage.image,
      },
    });
    const buildImage = new EcrLinuxArmLambdaBuildImage(buildImageAsset);

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
      source: Source.gitHub(gitHubSourceProps),
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
    buildImageAsset.repository.grantPull(codebuildProject);
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

interface HugoBuildPipelineProps {
  hugoImage: cdk.DockerImage;
}

export class HugoBuildPipeline extends Construct {
  pipelineProject: PipelineProject;

  constructor(scope: Construct, id: string, props: HugoBuildPipelineProps) {
    super(scope, id);
    const stack = cdk.Stack.of(this);

    const assetLocation = stack.synthesizer.addDockerImageAsset({
      sourceHash: props.hugoImage.toJSON(),
      executable: ['echo', props.hugoImage.image],
    });
    const cdkAssetRepository = Repository.fromRepositoryName(this, 'CdkAssetRepository', assetLocation.repositoryName);

    const pipelineProject = new PipelineProject(this, 'HugoBuildPipelineProject', {
      cache: Cache.local(LocalCacheMode.DOCKER_LAYER),
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'env',
              `aws ecr get-login-password | docker login --username AWS --password-stdin ${cdkAssetRepository.repositoryUri}`,
              `docker pull ${assetLocation.imageUri}`,
              'git submodule update --init',
              'ln -fsv /mnt/assets/node_modules assets/node_modules',
            ],
          },
          build: {
            commands: [
              `docker run --rm -v $PWD:/src ${assetLocation.imageUri} build -b https://man.hwangsehyun.com`,
              'ls -la public/index.json',
            ],
          },
        },
      }),
    });
    cdkAssetRepository.grantPull(pipelineProject);
    this.pipelineProject = pipelineProject;
  }
}
