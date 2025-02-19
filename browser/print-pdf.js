import { createReadStream } from 'fs';
import { createServer } from 'http';

import ora from 'ora';
import Printer from 'pagedjs-cli';
import handler from 'serve-handler';

import HeadTransformStream from './lib/head-transform-stream.js';
// import PdflibMerger from './lib/pdf-lib.js';
import launchBrowser from './lib/puppeteer-browser.js';

const overridePaths = new Set(process.argv.slice(2));
console.error({ overridePaths });

const server = createServer((request, response) => {
  handler(request, response, {
    public: 'public',
    headers: [{
      source: '**/*.html',
      headers: [{
        key: 'Content-Length',
        value: null,
      }],
    }],
  }, {
    createReadStream(path) {
      console.error(path);
      const stream = createReadStream(path);
      // return stream;
      if (!path.endsWith('html'))
        return stream;
      const replacedUrl = `http://localhost:${server.address().port}`;
      return stream
        .pipe(new HeadTransformStream('defer="TO_BE_REMOVED_IN_PUPPETTER"', ''))
        .pipe(new HeadTransformStream('integrity', 'nointegrity'))
        .pipe(new HeadTransformStream('https://man.hwangsehyun.com', replacedUrl));
    },
  });
});

const spinner = ora({
  discardStdin: false,
});

class BrowserlessPrinter extends Printer {
  constructor(browser, outlines) {
    super({
      enableWarnings: true,
      closeAfter: false,
    });
    this.browser = browser;
    this.outlines = outlines;
  }

  async renderPdf(input) {
    // console.error(input);
    spinner.start('Loading: ');

    this.on('page', page => {
      console.error(this.path);
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
    // await new Promise(resolve => { });
    spinner.start('Loading: ');

    // const merger = new PdflibMerger();
    // const pdfDocs = [];

    // eslint-disable-next-line no-restricted-syntax
    // for await (const url of urls) {
    const printer = new BrowserlessPrinter(browser);
    printer.path = url;
    const pdfBuffer = await printer.renderPdf({ url });
    spinner.succeed('Processed');
    // pdfDocs.push(pdfDoc);
    // await merger.add(pdfDoc);
    // }
    // merger.setOutline(pdfDocs);

    return Promise.all([
      process.stdout.write(pdfBuffer),
      new Promise((resolve, reject) => server.close(error => {
        error ? reject(error) : resolve();
      })),
      browser.close(),
    ]);
  });
