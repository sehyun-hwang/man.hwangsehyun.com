/* eslint-disable max-classes-per-file */
import assert from 'assert/strict';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { S3ToLambda } from '@aws-solutions-constructs/aws-s3-lambda';
import { Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  type CfnDistribution, Distribution, type DistributionProps,
  HttpVersion,
  PriceClass, ResponseHeadersPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { BucketDeployment } from 'aws-cdk-lib/aws-s3-deployment';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

import { TEMPLATE_PATH } from './config';

const entry = fileURLToPath(import.meta.resolve('./lambda/index-html-created.ts'));

export enum CloudFrontTemplateStackParameters {
  DistributionIdParameter = 'DistributionIdParameter',
  DistributionDomainNameParameter = 'DistributionDomainNameParameter',
  BucketArnParameter = 'BucketArnParameter',
  PipelineExecutionIdParameter = 'PipelineExecutionIdParameter',
}

class CloudFrontTemplateStack extends cdk.Stack {
  constructor(id: string, props: cdk.StackProps) {
    super(undefined, id, props);

    const bucketArnParameter = new cdk.CfnParameter(
      this,
      CloudFrontTemplateStackParameters.BucketArnParameter,
    );
    const distributionIdParameter = new cdk.CfnParameter(
      this,
      CloudFrontTemplateStackParameters.DistributionIdParameter,
    );
    const distributionDomainNameParameter = new cdk.CfnParameter(
      this,
      CloudFrontTemplateStackParameters.DistributionDomainNameParameter,
    );
    const pipelineExecutionIdParameter = new cdk.CfnParameter(
      this,
      CloudFrontTemplateStackParameters.PipelineExecutionIdParameter,
      {
        default: '',
      },
    );

    const distribution = Distribution.fromDistributionAttributes(this, 'Distribution', {
      distributionId: distributionIdParameter.valueAsString,
      domainName: distributionDomainNameParameter.valueAsString,
    });

    // eslint-disable-next-line no-new
    const destinationBucket = Bucket.fromBucketArn(this, 'EmptyBucket', bucketArnParameter.valueAsString);

    // eslint-disable-next-line no-new
    new BucketDeployment(this, 'BucketDeployment', {
      sources: [],
      destinationBucket,
      distribution,
      prune: false,
    });

    const isPipelineExecutionIdParameterEmpty = new cdk.CfnCondition(this, 'IsPipelineExecutionIdParameterEmpty', {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(pipelineExecutionIdParameter.valueAsString, '')),
    });
    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'UrlOutput', {
      value: `https://${distributionDomainNameParameter.valueAsString}/${pipelineExecutionIdParameter.valueAsString}`,
      condition: isPipelineExecutionIdParameterEmpty,
    });
  }
}

interface CloudFrontStackProps extends cdk.StackProps {
  domainName?: string;
  forbiddenResponsePagePath?: string;
}

export default class CloudFrontStack extends cdk.Stack {
  deploymentBucket: Bucket;

  distribution: Distribution;

  templateAsset: Asset;

  publicArtifact = new Artifact();

  domainName: string;

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
        `arn:aws:lambda:${this.region}:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:21`,
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
    });
    assert(s3Bucket);
    this.deploymentBucket = s3Bucket;
    s3Bucket.grantReadWrite(existingLambdaObj);

    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:us-east-1:248837585826:certificate/486915f0-f494-4093-a0ba-5b10fcf8c663',
    );

    const { cloudFrontWebDistribution } = new CloudFrontToS3(this, 'CloudFrontToS3', {
      existingBucketObj: s3Bucket,
      cloudFrontDistributionProps: ({
        priceClass: PriceClass.PRICE_CLASS_200,
        domainNames: props.domainName ? [props.domainName] : [],
        certificate: props.domainName && certificate,
        httpVersion: HttpVersion.HTTP2_AND_3,
        defaultRootObject: 'index.html',
        errorResponses: props.forbiddenResponsePagePath ? [{
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: props.forbiddenResponsePagePath,
        }] : [],
      } as DistributionProps),
      insertHttpSecurityHeaders: false,
    });
    this.domainName = props.domainName || cloudFrontWebDistribution.distributionDomainName;
    this.distribution = cloudFrontWebDistribution;

    (cloudFrontWebDistribution.node.defaultChild as CfnDistribution).addPropertyOverride(
      'DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId',
      ResponseHeadersPolicy.SECURITY_HEADERS.responseHeadersPolicyId,
    );

    const workdir = cdk.FileSystem.mkdtemp('s3-deployment-custom-');
    writeFileSync(
      join(workdir, TEMPLATE_PATH),
      JSON.stringify(Template.fromStack(stack).toJSON()),
    );
    // eslint-disable-next-line no-new
    this.templateAsset = new Asset(this, 'TemplateAsset', {
      path: workdir,
    });
  }
}
