import { readdir } from 'fs/promises';
import { join } from 'path';

import puppeteer from 'puppeteer-core';

const BROWSER_FOLDER = '/usr/local/bin/playwright-browsers'

export default () => readdir(BROWSER_FOLDER)
  .then(folders => puppeteer.launch({
    executablePath: join(BROWSER_FOLDER, folders.find(folder => folder.includes('chromium')), 'chrome-linux/chrome'),
    defaultViewport: {
      width: 1072,
      height: 1072,
    },
  }));
