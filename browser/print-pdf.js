import { createReadStream } from 'fs';
import { createServer } from 'http';

import Printer from 'pagedjs-cli';
import handler from 'serve-handler';
import ora from 'ora';

import HeadTransformStream from './lib/head-transform-stream.js';
import PdflibMerger from './lib/pdf-lib.js';
import launchBrowser from './lib/puppeteer-browser.js';
import listLocalPermalinks from './lib/permalink-json.js';

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

    const { pdfDoc, outline } = await this.pdf(input, {
      outlineTags: ['h1.post-title', 'h2'],
    });
    this.outlines.push(...outline);
    return pdfDoc;
  }
}

new Promise(resolve => server.listen(0, resolve))
  .then(() => Promise.all([
    listLocalPermalinks(server.address().port),
    launchBrowser(),
  ]))
  .then(async ([urls, browser]) => {
    console.error(urls);
    if (overridePaths.size)
      urls = urls.filter(url => overridePaths.has(new URL(url).pathname));
    console.error(urls);
    console.error(`Server to replace listening http://localhost:${server.address().port}`);
    // await new Promise(resolve => { });
    spinner.start('Loading: ');

    const merger = new PdflibMerger();
    const pdfDocs = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const url of urls) {
      const printer = new BrowserlessPrinter(browser, merger.outline);
      printer.path = url;
      const pdfDoc = await printer.renderPdf({ url });
      spinner.succeed('Processed');
      pdfDocs.push(pdfDoc);
      await merger.add(pdfDoc);
    }
    merger.setOutline(pdfDocs);

    return Promise.all([
      merger.save('/dev/stdout'),
      new Promise((resolve, reject) => server.close(error => {
        error ? reject(error) : resolve();
      })),
      browser.close(),
    ]);
  });
