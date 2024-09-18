import launchBrowser from './lib/puppeteer-browser.js';

async function pipeScreenshotOfIndex() {
  const browser = await launchBrowser({
    width: 1072,
    height: 1072,
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
}

pipeScreenshotOfIndex();
