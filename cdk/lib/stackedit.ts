/* eslint-disable max-classes-per-file */
import {
  Artifacts, BuildSpec, Cache, type CfnProject, ComputeType, type IBuildImage,
  ImagePullPrincipalType, LinuxArmLambdaBuildImage, LocalCacheMode, PipelineProject, Project,
  ReportGroup, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { type IRepository, Repository } from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source as S3Source } from 'aws-cdk-lib/aws-s3-deployment';
import { type ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib/core';
import { BuildSpec as DelivlibBuildSpec, type EnvStruct } from 'aws-delivlib';
import { Construct } from 'constructs';

import { gitHubSourceProps, SECRET_ARN } from './config';

const CONTENT_CACHE_IDENTIFIER = 'content_cache';

interface UpdatedEnvStruct extends EnvStruct {
  'secrets-manager'?: Record<string, string>;
}

function generateGuardedBuildSpec(
  secret: ISecret,
  delivlibBuildSpec: DelivlibBuildSpec,
): BuildSpec {
  const keys = secret.node.getContext('keys') as string[];
  const buildspecStruct = DelivlibBuildSpec.literal({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          `env ${keys.map(x => `-u ${x}`).join(' ')}`,
        ],
      },
    },
  })
    .merge(delivlibBuildSpec).render();
  buildspecStruct.env ??= {};
  const { env } = buildspecStruct as { env: UpdatedEnvStruct; };
  env['secrets-manager'] ??= {};
  const secretsManagerEnv = env['secrets-manager'];

  keys.forEach(key => { secretsManagerEnv[key] = secret.secretArn + ':' + key; });
  return BuildSpec.fromObject(buildspecStruct);
}

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
  codeBuildProject: Project;
  reportGroup: ReportGroup;
}

export default class StackEditStack extends cdk.Stack {
  exports: IStackEditStack;

  artifactsBucket: Bucket;

  constructor(scope: Construct, id: string, props: StackEditStackProps) {
    super(scope, id, props);

    const buildImageAsset = new DockerImageAsset(this, 'CodeBuildImage', {
      directory: '../src',
      buildArgs: {
        NODE_MODULES_IMAGE: props.nodeModulesImage.image,
      },
    });
    const buildImage = new EcrLinuxArmLambdaBuildImage(buildImageAsset);

    const bucket = new Bucket(this, 'ArtifactBucket', {
      versioned: true,
    });
    // eslint-disable-next-line no-new
    new BucketDeployment(this, 'EmptyCache', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'empty/content',
      sources: [S3Source.data('placeholder.txt', '')],
    });

    const reportGroup = new ReportGroup(this, 'ReportGroup');
    const secret = Secret.fromSecretCompleteArn(this, 'Secret', SECRET_ARN);
    secret.node.setContext('keys', ['CLOUDANT_APIKEY']);
    const buildSpec = generateGuardedBuildSpec(secret, DelivlibBuildSpec.literal({
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            'ln -sv /cofa_lambda_docker_build/stackedit-prod/node_modules src/node_modules',
            `cp -rv $CODEBUILD_SRC_DIR_${CONTENT_CACHE_IDENTIFIER}/content ./`,
          ],
        },
        build: {
          commands: [
            'node src',
          ],
        },
        post_build: {
          commands: [
            'cp -v config/_default/module.json content/',
            'zip -FSrv -x=content/content.zip -x="*.md.gz" content/content.zip content',
          ],
        },
      },
      artifacts: {
        name: 'content',
        'base-directory': 'content',
        files: ['**/*'],
        // @ts-expect-error Outdated type
        'exclude-paths': '**/*.gz',
      },
      reports: {
        [reportGroup.reportGroupArn]: {
          files: ['public/junit.xml'],
        },
      },
    }));

    const codeBuildProject = new Project(this, 'Project', {
      environment: {
        buildImage,
        computeType: ComputeType.LAMBDA_1GB,
      },
      source: Source.gitHub(gitHubSourceProps),
      secondarySources: [Source.s3({
        identifier: CONTENT_CACHE_IDENTIFIER,
        bucket,
        path: 'empty/',
      })],
      buildSpec,
      artifacts: Artifacts.s3({
        bucket,
        packageZip: false,
        encryption: false,
      }),
    });
    buildImageAsset.repository.grantPull(codeBuildProject);
    secret.grantRead(codeBuildProject);
    reportGroup.grantWrite(codeBuildProject);

    (codeBuildProject.node.defaultChild as CfnProject).addPropertyOverride('Environment.ImagePullCredentialsType', ImagePullPrincipalType.SERVICE_ROLE);

    this.artifactsBucket = bucket;
    this.exports = {
      codeBuildProject,
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

    const secret = Secret.fromSecretCompleteArn(stack, 'Secret', SECRET_ARN);
    secret.node.setContext('keys', ['HUGO_PARAMS_MICROCMS_KEY']);

    const buildSpec = generateGuardedBuildSpec(secret, DelivlibBuildSpec.literal({
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            `aws ecr get-login-password | docker login --username AWS --password-stdin ${cdkAssetRepository.repositoryUri}`,
            'ln -fsv /mnt/assets/node_modules assets/node_modules',
            'cp -rv $CODEBUILD_SRC_DIR_Artifact_Source_S3Source/content ./',
            'mkdir -p config/_default && mv -v content/module.json config/_default/',

            'git submodule update --init',
            `docker cp $(docker create ${assetLocation.imageUri}):/mnt/browser-prod/node_modules browser/node_modules`,
          ],
        },
        build: {
          commands: [
            `docker run --rm -v $PWD:/src -e HUGO_PARAMS_MICROCMS_KEY -e HUGO_PUBLISHDIR ${assetLocation.imageUri} build -b $HUGO_BASEURL`,
            'node browser/print-pdf.js $PDF_HTML_PATH > $HUGO_PUBLISHDIR/index.pdf',
          ],
        },
        post_build: {
          commands: [
            'ls -la public/index.pdf',
          ],
        },
      },
      artifacts: {
        name: 'public',
        'base-directory': 'public',
        files: ['**/*'],
      },
    }));

    const pipelineProject = new PipelineProject(this, 'HugoBuildPipelineProject', {
      cache: Cache.local(LocalCacheMode.DOCKER_LAYER),
      buildSpec,
      environment: {
        computeType: ComputeType.LARGE,
      },
    });
    secret.grantRead(pipelineProject);
    cdkAssetRepository.grantPull(pipelineProject);
    this.pipelineProject = pipelineProject;
  }
}
