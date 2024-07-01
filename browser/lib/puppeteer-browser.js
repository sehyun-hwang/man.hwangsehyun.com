import puppeteer from 'puppeteer-core';

export default () => puppeteer.launch({
  executablePath: '/usr/local/bin/playwright-browsers/chromium-1117/chrome-linux/chrome',
  defaultViewport: {
    width: 1072,
    height: 1072,
  },
});
