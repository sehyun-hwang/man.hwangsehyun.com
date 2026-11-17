/* eslint-disable max-classes-per-file */
import assert from 'assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
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
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import * as cdk from 'aws-cdk-lib/core';
import { MonitoringFacade } from 'cdk-monitoring-constructs';
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
    );

    // Inline code keeps the standalone template independent of unpublished Lambda/layer assets.
    const invalidationHandler = new LambdaFunction(this, 'InvalidationHandler', {
      runtime: Runtime.NODEJS_24_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      code: Code.fromInline(`
const { CloudFrontClient, CreateInvalidationCommand, waitUntilInvalidationCompleted } = require('@aws-sdk/client-cloudfront');
exports.handler = async event => {
  let status = 'SUCCESS';
  let reason = 'Invalidation completed';
  const physicalId = event.PhysicalResourceId || event.LogicalResourceId;
  try {
    if (event.RequestType !== 'Delete') {
      const client = new CloudFrontClient({});
      const { DistributionId, PipelineExecutionId } = event.ResourceProperties;
      const result = await client.send(new CreateInvalidationCommand({
        DistributionId,
        InvalidationBatch: {
          CallerReference: PipelineExecutionId + '-' + event.RequestId,
          Paths: { Quantity: 1, Items: ['/*'] },
        },
      }));
      await waitUntilInvalidationCompleted({ client, maxWaitTime: 720 }, {
        DistributionId, Id: result.Invalidation.Id,
      });
    }
  } catch (error) {
    status = 'FAILED';
    reason = error.message;
  }
  const response = await fetch(event.ResponseURL, {
    method: 'PUT',
    headers: { 'content-type': '' },
    body: JSON.stringify({
      Status: status, Reason: reason, PhysicalResourceId: physicalId,
      StackId: event.StackId, RequestId: event.RequestId, LogicalResourceId: event.LogicalResourceId,
    }),
  });
  if (!response.ok) throw new Error('CloudFormation response failed: ' + response.status);
};
`),
    });
    invalidationHandler.addToRolePolicy(new PolicyStatement({
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: [cdk.Stack.of(this).formatArn({
        service: 'cloudfront',
        region: '',
        resource: 'distribution',
        resourceName: distributionIdParameter.valueAsString,
      })],
    }));
    // eslint-disable-next-line no-new
    new cdk.CustomResource(this, 'Invalidation', {
      serviceToken: invalidationHandler.functionArn,
      properties: {
        // Retain compatibility with existing pipeline parameter overrides.
        BucketArn: bucketArnParameter.valueAsString,
        DistributionId: distributionIdParameter.valueAsString,
        PipelineExecutionId: pipelineExecutionIdParameter.valueAsString,
      },
    });

    const split = cdk.Fn.split('.', distributionDomainNameParameter.valueAsString, 3) as [string, string, string];
    const isDomainCloudFront = cdk.Fn.conditionEquals(cdk.Fn.join('.', [split[1], split[2]]), 'cloudfront.net');
    const isDomainCloudFrontCondition = new cdk.CfnCondition(this, 'IsDomainCloudFrontCondition', {
      expression: isDomainCloudFront,
    });
    const isDomainNotCloudFrontCondition = new cdk.CfnCondition(this, 'IsPipelineExecutionIdParameterNotEmpty', {
      expression: cdk.Fn.conditionNot(isDomainCloudFront),
    });
    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'UrlOutput', {
      value: `https://${distributionDomainNameParameter.valueAsString}/${pipelineExecutionIdParameter.valueAsString}/`,
      condition: isDomainCloudFrontCondition,
    });
    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'OriginOutput', {
      value: 'https://' + distributionDomainNameParameter.valueAsString,
      condition: isDomainNotCloudFrontCondition,
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

    const lambdaFunction = new NodejsFunction(this, 'NodejsFunction', {
      entry,
      runtime: Runtime.NODEJS_24_X,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [
          '@aws-sdk/*',
        ],
      },
      // @TODO Temp
      reservedConcurrentExecutions: 10,
    });

    const { s3Bucket } = new S3ToLambda(this, 'S3ToLambda', {
      existingLambdaObj: lambdaFunction,
      s3EventSourceProps: {
        events: [EventType.OBJECT_CREATED_PUT],
        filters: [{
          suffix: '.html',
        }],
      },
    });
    assert(s3Bucket);
    this.deploymentBucket = s3Bucket;
    s3Bucket.grantReadWrite(lambdaFunction);

    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:us-east-1:248837585826:certificate/486915f0-f494-4093-a0ba-5b10fcf8c663',
    );

    const { cloudFrontWebDistribution: distribution } = new CloudFrontToS3(this, 'CloudFrontToS3', {
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
    this.domainName = props.domainName || distribution.distributionDomainName;
    this.distribution = distribution;

    (distribution.node.defaultChild as CfnDistribution).addPropertyOverride(
      'DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId',
      ResponseHeadersPolicy.SECURITY_HEADERS.responseHeadersPolicyId,
    );

    const monitoring = new MonitoringFacade(this, this.stackName + 'Monitoring', {

    });
    monitoring.monitorLambdaFunction({
      lambdaFunction,
      addFaultCountAlarm: {
        AnyFault: {
          maxErrorCount: 0,
        },
      },
    });
    monitoring.monitorCloudFrontDistribution({
      distribution,
    });

    const workdir = mkdtempSync('.cloudfront-template-');
    writeFileSync(
      join(workdir, TEMPLATE_PATH),
      JSON.stringify(Template.fromStack(stack).toJSON()),
    );

    // eslint-disable-next-line no-new
    this.templateAsset = new Asset(this, 'TemplateAsset', {
      path: workdir,
    });
    rmSync(workdir, { recursive: true });
  }
}
