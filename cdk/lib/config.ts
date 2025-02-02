import type { GitHubSourceProps } from 'aws-cdk-lib/aws-codebuild';
import type { CodeStarConnectionsSourceActionProps } from 'aws-cdk-lib/aws-codepipeline-actions';

const owner = 'sehyun-hwang';
const repo = 'man.hwangsehyun.com';
const branch = '31-cdk-codebuild';

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
