/* eslint-disable max-classes-per-file */
import { EventbridgeToStepfunctions } from '@aws-solutions-constructs/aws-eventbridge-stepfunctions';
import { Schedule } from 'aws-cdk-lib/aws-events';
import {
  Choice, Condition, DefinitionBody, FieldUtils, IntegrationPattern, JsonPath,
} from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService, CodeBuildStartBuild } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import { IStackEditStack } from './stackedit';

/** @link https://github.com/aws/aws-cdk/blob/v2.177.0/packages/aws-cdk-lib/aws-stepfunctions-tasks/lib/private/task-utils.ts */
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

/** @link https://github.com/aws/aws-cdk/issues/10302 */
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

interface StackEditStepFunctionsStackProps extends cdk.StackProps, IStackEditStack { }

export default class StackEditStepFunctionsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackEditStepFunctionsStackProps) {
    super(scope, id, props);

    /** @link https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ListReportsForReportGroup.html */
    const listReportsTask = new CallAwsService(this, 'ListReportsTask', {
      service: 'codebuild',
      action: 'listReportsForReportGroup',
      iamResources: [props.reportGroup.reportGroupArn],
      parameters: {
        MaxResults: 1,
        ReportGroupArn: props.reportGroup.reportGroupArn,
      },
      resultSelector: {
        'Reports.$': '$.Reports',
        // eslint-disable-next-line quotes
        ReportsLength: JsonPath.arrayLength(JsonPath.objectAt('$.Reports')).replace("'", ''),
      },
    });

    /** @link https://docs.aws.amazon.com/step-functions/latest/dg/connect-codebuild.html#:~:text=%3A*%3Aproject/*%22%0A%20%20%20%20%20%20%5D%0A%20%20%20%20%7D%0A%20%20%5D%0A%7D-,BatchGetReports,-Static%20resources */
    const batchGetReportsTask = new CallAwsService(this, 'BatchGetReportsTask', {
      service: 'codebuild',
      action: 'batchGetReports',
      parameters: {
        ReportArns: JsonPath.array(JsonPath.stringAt('$.Reports[0]')),
      },
      iamResources: [props.reportGroup.reportGroupArn],
    });

    const startBuildTaskWithOverride = new OverridableCodeBuildStartBuild(this, 'StartBuildTaskWithOverride', {
      project: props.codeBuildProject,
      integrationPattern: IntegrationPattern.RUN_JOB,
      // @ts-expect-error Deliberate
      overrides: {
        SecondarySourcesOverride: [{
          Type: 'S3',
          Location: JsonPath.format(
            props.artifactsBucket.bucketName + '/{}/',
            JsonPath.arrayGetItem(
              JsonPath.stringSplit(JsonPath.stringAt('$.Reports[0].ExecutionId'), ':'),
              6,
            ),
          ),
          SourceIdentifier: 'content_cache',
        }],
      },
    });

    const startBuildTask = new CodeBuildStartBuild(this, 'StartBuildTask', {
      project: props.codeBuildProject,
      integrationPattern: IntegrationPattern.RUN_JOB,
    });

    const listReportsChoice = new Choice(this, 'ListReportsChoice')
      .when(Condition.numberEquals('$.ReportsLength', 0), startBuildTask)
      .otherwise(batchGetReportsTask.next(startBuildTaskWithOverride));

    const taskChain = listReportsTask
      .next(listReportsChoice);

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
  }
}
