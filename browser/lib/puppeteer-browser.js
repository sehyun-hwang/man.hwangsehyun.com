import { access, readdir } from 'fs/promises';
import { join } from 'path';

import puppeteer from 'puppeteer-core';

async function findExecutable() {
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // Mac
    '/opt/chromium/chrome-linux/chrome', // CodeBuild
    '/usr/bin/chromium', // Idx
  ];
  // eslint-disable-next-line no-restricted-syntax
  for (const path of paths) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await access(path);
      return path;
    } catch (error) {
      console.error(error);
    }
  }

  try {
    const playwrightFolder = '/usr/local/bin/playwright-browsers';
    const folders = await readdir(playwrightFolder);
    return join(playwrightFolder, folders.find(folder => folder.includes('chromium')), 'chrome-linux/chrome');
  } catch (error) {
    console.error(error);
  }

  return undefined;
}

export default (defaultViewport = undefined) => findExecutable()
  .then(executablePath => puppeteer.launch({
    executablePath,
    headless: process.platform !== 'darwin',
    args: ['--no-sandbox', '--export-tagged-pdf'],
    defaultViewport,
    slowMo: 10, // @TODO Demolish
  }));
