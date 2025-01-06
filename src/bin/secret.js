import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SSOClient, GetRoleCredentialsCommand } from '@aws-sdk/client-sso';

const accountId = '248837585826';
const roleName = 'AdministratorAccess';
const SecretId = 'man.hwangsehyun.com';
const CLOUDANT_ENV_FILE = 'cloudant.env';
const HUGO_PARAMS_FILE = 'config/_default/params.json';
const cacheDir = path.join(os.homedir(), '.aws', 'sso', 'cache');
const ssoClient = new SSOClient({
  region: 'us-east-1',
});

async function getLastModifiedFile(dir) {
  const files = await fs.readdir(dir);

  // Filter files with the specified length
  const filteredFiles = files.filter(file => file.length === 40 + '.json'.length);

  if (filteredFiles.length === 0) {
    throw new Error('No file with the specified length found.');
  }

  // Use reduce to find the last modified file
  const lastModifiedFile = await filteredFiles.reduce(async (latestFilePromise, currentFile) => {
    const latestFile = await latestFilePromise;
    const currentFilePath = path.join(dir, currentFile);
    const currentStats = await fs.stat(currentFilePath);

    if (!latestFile) {
      return { file: currentFile, mtime: currentStats.mtime };
    }

    const latestFilePath = path.join(dir, latestFile.file);
    const latestStats = await fs.stat(latestFilePath);

    return currentStats.mtime > latestStats.mtime ? {
      file: currentFile,
      mtime: currentStats.mtime,
    } : latestFile;
  }, Promise.resolve(null));

  return path.join(dir, lastModifiedFile.file);
}

const loadCredentialsFromSso = () => getLastModifiedFile(cacheDir)
  .then(filePath => fs.readFile(filePath, 'utf-8'))
  .then(JSON.parse)
  .then(({ accessToken }) => {
    const command = new GetRoleCredentialsCommand({
      accountId,
      roleName,
      accessToken,
    });
    return ssoClient.send(command);
  })
  .then(({
    roleCredentials: {
      expiration,
      ...credentials
    },
  }) => credentials)
  .catch(console.warn);

const fetchSecrets = () => loadCredentialsFromSso()
  .then(credentials => {
    const client = new SecretsManagerClient({
      region: 'ap-northeast-1',
      credentials,
    });
    return client.send(new GetSecretValueCommand({
      SecretId,
    }));
  })
  .then(({ SecretString }) => JSON.parse(SecretString));

const writeSecrets = secrets => {
  const hugoParams = {};
  let cloudantEnv = '';
  Object.entries(secrets).forEach(([key, value]) => {
    if (key.startsWith('HUGO_PARAMS_'))
      hugoParams[key.replace('HUGO_PARAMS_', '')] = value;
    else if (key.startsWith('CLOUDANT_'))
      cloudantEnv += `${key}=${value}\n`;
    else
      throw new Error('Unknown secret key: ' + key);
  });

  return Promise.all([
    fs.mkdir(path.dirname(HUGO_PARAMS_FILE), { recursive: true })
      .then(() => fs.writeFile(HUGO_PARAMS_FILE, JSON.stringify(hugoParams))),
    fs.writeFile(CLOUDANT_ENV_FILE, cloudantEnv),
  ]);
};

fetchSecrets()
  .then(writeSecrets);
