import type { GitHubSourceProps } from 'aws-cdk-lib/aws-codebuild';
import type { CodeStarConnectionsSourceActionProps } from 'aws-cdk-lib/aws-codepipeline-actions';

const owner = 'sehyun-hwang';
const repo = 'man.hwangsehyun.com';
const branch = '33-pdf-refactoring-2';

export const gitHubSourceProps: GitHubSourceProps = {
  identifier: 'src',
  owner,
  repo,
  branchOrRef: branch,
} as const;

export const codeStarConnectionsSourceActionProps: Omit<CodeStarConnectionsSourceActionProps, 'output'> = {
  actionName: 'GitHubSource',
  connectionArn: 'arn:aws:codeconnections:ap-northeast-1:248837585826:connection/b04b5397-10b4-4896-8d31-7c529c898b5f',
  owner,
  repo,
  branch,
  codeBuildCloneOutput: true,
} as const;

export const CONTENT_KEY = 'content.zip';

export const SECRET_ARN = 'arn:aws:secretsmanager:ap-northeast-1:248837585826:secret:man.hwangsehyun.com-Wk9Cto';
