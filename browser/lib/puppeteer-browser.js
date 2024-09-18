import { join } from 'path';
import { readdir } from 'fs/promises';

import puppeteer from 'puppeteer-core';

const BROWSER_FOLDER = '/usr/local/bin/playwright-browsers';

export default (defaultViewport = undefined) => readdir(BROWSER_FOLDER)
  .catch(console.error)
  .then(folders => puppeteer.launch({
    executablePath: folders ? join(BROWSER_FOLDER, folders.find(folder => folder.includes('chromium')), 'chrome-linux/chrome')
      : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: Boolean(folders),
    args: ['--no-sandbox', '--export-tagged-pdf'],
    defaultViewport,
    slowMo: 10, // @TODO Demolish
  }));
