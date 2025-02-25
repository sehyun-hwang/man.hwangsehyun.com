import { createReadStream } from 'fs';
import { createServer } from 'http';

import ora from 'ora';
import Printer from 'pagedjs-cli';
import handler from 'serve-handler';

import HeadTransformStream from './lib/head-transform-stream.js';
import launchBrowser from './lib/puppeteer-browser.js';

const server = createServer((request, response) => {
  handler(request, response, {
    public: 'public',
    headers: [{
      source: '**/*.html',
      headers: [{
        key: 'Content-Length',
        value: null,
      }, {
        key: 'Content-Security-Policy',
        // eslint-disable-next-line quotes
        value: "frame-src 'none';",
      }],
    }],
  }, {
    createReadStream(path) {
      console.error(path);
      const stream = createReadStream(path);
      if (!path.endsWith('html'))
        return stream;
      const replacedUrl = `http://localhost:${server.address().port}`;
      return stream
        .pipe(new HeadTransformStream('defer="TO_BE_REMOVED_IN_PUPPETTER"', ''))
        .pipe(new HeadTransformStream('integrity', 'nointegrity'))
        .pipe(new HeadTransformStream(/https:\/\/.+.(:?com|net)/g, replacedUrl));
    },
  });
});

const spinner = ora({
  discardStdin: false,
});

class BrowserlessPrinter extends Printer {
  constructor(browser) {
    super({
      enableWarnings: true,
      closeAfter: false,
      styles: [
        'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100..900&display=swap',
        'data:text/css,' + encodeURIComponent('body { font-family: "Noto Sans KR", serif !important; }'),
      ],
    });
    this.browser = browser;
  }

  renderPdf(input) {
    // console.error(input);
    spinner.start('Loading: ');

    this.on('page', page => {
      if (page.position === 0) {
        spinner.succeed('Loaded');
        spinner.start('Rendering: Page ' + (page.position + 1));
      } else {
        spinner.text = 'Rendering: Page ' + (page.position + 1);
      }
    });

    this.on('rendered', msg => {
      spinner.succeed(msg);
      spinner.start('Generating');
    });

    this.on('postprocessing', msg => {
      spinner.succeed(msg);
      spinner.start('Processing');
    });

    return this.pdf(input, {
      outlineTags: ['.page-header h1', 'h1.post-title'],
    });
  }
}

new Promise(resolve => server.listen(0, resolve))
  .then(() => Promise.all([
    `http://localhost:${server.address().port}/all`,
    launchBrowser(),
  ]))
  .then(async ([url, browser]) => {
    console.error(url);
    console.error(`Server to replace listening http://localhost:${server.address().port}`);
    spinner.start('Loading: ');

    const printer = new BrowserlessPrinter(browser);
    const pdfBuffer = await printer.renderPdf({ url });
    spinner.succeed('Processed');

    return Promise.all([
      process.stdout.write(pdfBuffer),
      new Promise((resolve, reject) => server.close(error => {
        error ? reject(error) : resolve();
      })),
      browser.close(),
    ]);
  });
