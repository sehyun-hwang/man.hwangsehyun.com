import fs from 'fs/promises';
import path from 'path';

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
const SecretId = 'man.hwangsehyun.com';
const CLOUDANT_ENV_FILE = 'cloudant.env';
const HUGO_PARAMS_FILE = 'config/_default/params.json';

const fetchSecrets = async () => {
  const client = new SecretsManagerClient({ region: 'ap-northeast-1' });
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId }));
  if (!SecretString)
    throw new Error('Expected a JSON SecretString.');
  return JSON.parse(SecretString);
};

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
