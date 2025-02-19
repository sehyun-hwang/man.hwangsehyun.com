/* eslint-disable max-classes-per-file */
import { EventbridgeToStepfunctions } from '@aws-solutions-constructs/aws-eventbridge-stepfunctions';
import { Schedule } from 'aws-cdk-lib/aws-events';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  Choice, Condition, DefinitionBody, FieldUtils, IntegrationPattern, JsonPath, LogLevel,
  StateMachine, Succeed, type TaskStateBase,
} from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService, CodeBuildStartBuild } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import { CONTENT_KEY } from './config';
import { type IStackEditStack } from './stackedit';

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

interface CommonTasksProps extends IStackEditStack {
  deploymentBucket: Bucket;
}

class CommonTasks extends Construct {
  listReportsTask: TaskStateBase;

  batchGetReportsTask: TaskStateBase;

  startBuildTaskWithOverride: TaskStateBase;

  startBuildTask: TaskStateBase;

  getReportTask: TaskStateBase;

  copyObjectTask: TaskStateBase;

  constructor(scope: Construct, id: string, props: CommonTasksProps) {
    super(scope, id);

    /** @link https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ListReportsForReportGroup.html */
    this.listReportsTask = new CallAwsService(this, 'ListReportsTask', {
      service: 'codebuild',
      action: 'listReportsForReportGroup',
      iamResources: [props.reportGroup.reportGroupArn],
      parameters: {
        MaxResults: 1,
        ReportGroupArn: props.reportGroup.reportGroupArn,
      },
      resultSelector: {
        'Reports.$': '$.Reports',
        ReportsLength: JsonPath.arrayLength(JsonPath.objectAt('$.Reports')),
      },
    });

    /** @link https://docs.aws.amazon.com/step-functions/latest/dg/connect-codebuild.html#:~:text=%3A*%3Aproject/*%22%0A%20%20%20%20%20%20%5D%0A%20%20%20%20%7D%0A%20%20%5D%0A%7D-,BatchGetReports,-Static%20resources */
    this.batchGetReportsTask = new CallAwsService(this, 'BatchGetReportsTask', {
      service: 'codebuild',
      action: 'batchGetReports',
      parameters: {
        ReportArns: JsonPath.array(JsonPath.stringAt('$.Reports[0]')),
      },
      iamResources: [props.reportGroup.reportGroupArn],
    });
    this.startBuildTaskWithOverride = new OverridableCodeBuildStartBuild(this, 'StartBuildTaskWithOverride', {
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
    this.startBuildTask = new CodeBuildStartBuild(this, 'StartBuildTask', {
      project: props.codeBuildProject,
      integrationPattern: IntegrationPattern.RUN_JOB,
    });

    this.getReportTask = new CallAwsService(this, 'GetReportTask', {
      service: 'codebuild',
      action: 'batchGetReports',
      parameters: {
        ReportArns: JsonPath.array(JsonPath.stringAt('$.Build.ReportArns[0]')),
      },
      iamResources: [props.reportGroup.reportGroupArn],
    });
    /** @link https://stackoverflow.com/a/75596750 */
    this.copyObjectTask = new CallAwsService(this, 'CopyObjectTask', {
      service: 's3',
      action: 'copyObject',
      parameters: {
        Bucket: props.deploymentBucket.bucketName,
        CopySource: JsonPath.format(
          `/${props.artifactsBucket.bucketName}/{}/content/${CONTENT_KEY}`,
          JsonPath.arrayGetItem(
            JsonPath.stringSplit(JsonPath.stringAt('$.Reports[0].ExecutionId'), ':'),
            6,
          ),
        ),
        Key: CONTENT_KEY,
      },
      iamAction: 's3:ListBucket',
      iamResources: [props.artifactsBucket.bucketArn, props.deploymentBucket.bucketArn],
      additionalIamStatements: [
        new PolicyStatement({
          actions: [
            's3:GetObject',
            's3:GetObjectTagging',
          ],
          resources: [props.artifactsBucket.arnForObjects('*/' + CONTENT_KEY)],
        }),
        new PolicyStatement({
          actions: [
            's3:PutObject',
            's3:PutObjectTagging',
            's3:PutObjectAcl',
          ],
          resources: [props.deploymentBucket.arnForObjects(CONTENT_KEY)],
        }),
      ],
    });
  }
}

interface StackEditStepFunctionsStackProps extends cdk.StackProps, IStackEditStack { }

export default class StackEditStepFunctionsStack extends cdk.Stack {
  deploymentBucket: Bucket;

  constructor(scope: Construct, id: string, props: StackEditStepFunctionsStackProps) {
    super(scope, id, props);

    const deploymentBucket = new Bucket(this, 'DeploymentBucket', {
      versioned: true,
    });
    this.deploymentBucket = deploymentBucket;

    const commonTasks = new CommonTasks(this, 'CommonTasks', {
      deploymentBucket,
      ...props,
    });
    const succeed = new Succeed(this, 'Succeed');
    const copyObjectChoice = new Choice(this, ' CopyObjectChoice')
      .when(Condition.stringEquals('$.Reports[0].Status', 'FAILED'), commonTasks.copyObjectTask)
      .otherwise(succeed);
    const postBuildTasksChain = commonTasks.getReportTask.next(copyObjectChoice);

    const listReportsChoice = new Choice(this, 'ListReportsChoice')
      .when(
        Condition.numberEquals('$.ReportsLength', 0),
        commonTasks.startBuildTask.next(postBuildTasksChain),
      )
      .otherwise(
        commonTasks.batchGetReportsTask.next(commonTasks.startBuildTaskWithOverride)
          .next(postBuildTasksChain),
      );
    const taskChain = commonTasks.listReportsTask
      .next(listReportsChoice);

    const eventBridgeToStepFunctions = new EventbridgeToStepfunctions(this, 'EventbridgeToStepFunctions', {
      stateMachineProps: {
        definitionBody: DefinitionBody.fromChainable(taskChain),
        tracingEnabled: true,
      },
      eventRuleProps: {
        schedule: Schedule.rate(cdk.Duration.minutes(1)),
      },
    });

    const commonTasks2 = new CommonTasks(this, 'FreshCommonTasks', {
      deploymentBucket,
      ...props,
    });
    const freshTaskChain = commonTasks2.startBuildTask
      .next(commonTasks2.getReportTask)
      .next(commonTasks2.copyObjectTask);
    const freshStateMachine = new StateMachine(this, 'FreshStateMachine', {
      definitionBody: DefinitionBody.fromChainable(freshTaskChain),
      logs: {
        destination: eventBridgeToStepFunctions.stateMachineLogGroup,
        level: LogLevel.ALL,
      },
    });
    eventBridgeToStepFunctions.stateMachineLogGroup.grantWrite(freshStateMachine);

    (eventBridgeToStepFunctions.stateMachineLogGroup.node.defaultChild as cdk.CfnResource)
      .applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
  }
}
