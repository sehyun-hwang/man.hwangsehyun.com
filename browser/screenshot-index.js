const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/playwright-browsers/chromium-1117/chrome-linux/chrome',
    defaultViewport: {
      width: 1072,
      height: 1072,
    },
  });
  const page = await browser.newPage();
  await page.goto('https://man.hwangsehyun.com', { 
    waitUntil: 'networkidle0',
  });

  const screenshot = await page.screenshot({
    type: 'webp',
    encoding: 'binary',
  });

  if (process.stdout.isTTY)
    console.error('not redirected');
  else {
    console.error('redirected');
    process.stdout.write(screenshot);
  }

  await browser.close();
  console.error('done');
})();
