/* eslint-disable max-classes-per-file */
import assert from 'assert/strict';
import { fileURLToPath } from 'url';

import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { S3ToLambda } from '@aws-solutions-constructs/aws-s3-lambda';
import { Template } from 'aws-cdk-lib/assertions';
import { PriceClass } from 'aws-cdk-lib/aws-cloudfront';
import type { Role } from 'aws-cdk-lib/aws-iam';
import { LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

import { TEMPLATE_KEY } from './config';

const entry = fileURLToPath(import.meta.resolve('./lambda/index-html-created.ts'));

interface CloudFrontTemplateStackProps {
}

class CloudFrontTemplateStack extends cdk.Stack {
  constructor(id: string, props: CloudFrontTemplateStackProps) {
    super(undefined, id, props);

    const bucketArnParameter = new cdk.CfnParameter(this, 'BucketArnParameter');

    const bucket = Bucket.fromBucketArn(this, 'Bucket', bucketArnParameter.valueAsString);
    const { cloudFrontWebDistribution: distribution } = new CloudFrontToS3(this, 'CloudFrontToS3', {
      existingBucketObj: bucket,
      cloudFrontDistributionProps: {
        priceClass: PriceClass.PRICE_CLASS_200,
      },
    });

    new BucketDeployment(this, 'BucketDeployment', {
      sources: [],
      destinationBucket: bucket,
      distribution,
      prune: false,
    });
  }
}

interface CloudFrontStackProps extends cdk.StackProps {
  artifactsBucket: Bucket;
  lambdaRole: Role;
}

export default class CloudFrontStack extends cdk.Stack {
  deploymentBucket: Bucket;

  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const stack = new CloudFrontTemplateStack('CloudFrontStack', {});
    // eslint-disable-next-line no-new

    const existingLambdaObj = new NodejsFunction(this, 'NodejsFunction', {
      entry,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [
          '@aws-sdk/*',
          '@aws-lambda-powertools/*',
        ],
      },
      layers: [LayerVersion.fromLayerVersionArn(
        this,
        'PowerToolsLayer',
        `arn:aws:lambda:${this.region}:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:20`,
      )],
    });

    const { s3Bucket } = new S3ToLambda(this, 'S3ToLambda', {
      existingLambdaObj,
      s3EventSourceProps: {
        events: [EventType.OBJECT_CREATED],
        filters: [{
          suffix: '.html',
        }],
      },
      bucketProps: {
        versioned: true,
      },
    });
    assert(s3Bucket);
    this.deploymentBucket = s3Bucket;

    // eslint-disable-next-line no-new
    new BucketDeployment(this, 'TemplateBucketDeployment', {
      role: props.lambdaRole,
      sources: [Source.jsonData(TEMPLATE_KEY, Template.fromStack(stack).toJSON())],
      destinationBucket: props.artifactsBucket,
      prune: false,
    });
  }
}
