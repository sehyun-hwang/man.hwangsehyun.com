import { createReadStream } from 'fs';
import { createServer } from 'http';
import { text } from 'stream/consumers';

import PDFMerger from 'pdf-merger-js';
import Printer from 'pagedjs-cli';
import handler from 'serve-handler';
import ora from 'ora';

import HeadTransformStream from './lib/head-transform-stream.js';
import launchBrowser from './lib/puppeteer-browser.js';
import listLocalPermalinks from './lib/permalink-json.js';

const overridePaths = process.argv.slice(2);

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  handler(request, response, {
    public: 'public',
  });
});

const spinner = ora({
  discardStdin: false,
});

class BrowserlessPrinter extends Printer {
  constructor(browser) {
    super({
      enableWarnings: true,
    });
    this.browser = browser;
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
      spinner.succeed('Generated');
      spinner.start('Processing');
    });

    // const output = await printer.render(input)
    // .then(page => page.pdf());
    const buffer = await this.pdf(input, { outlineTags: ['h2'] });
    console.error('PDF output', buffer.length);
    return Uint8Array.from(buffer);
  }
}

Promise.all([
  new Promise(resolve => server.listen(0, resolve))
    .then(() => `http://localhost:${server.address().port}`),
  overridePaths.length ? overridePaths : listLocalPermalinks(),
  launchBrowser(),
])
  .then(async ([replacedUrl, paths, browser]) => {
    console.error('Server to replace', replacedUrl, 'listening');
    spinner.start('Loading: ');

    const pdfs = await Promise.all(paths.slice(0, 100).map(async path => {
      const printer = new BrowserlessPrinter(browser);
      printer.path = path;
      const html = await text(
        createReadStream(path)
          .pipe(new HeadTransformStream('defer="TO_BE_REMOVED_IN_PUPPETTER"', ''))
          .pipe(new HeadTransformStream('integrity', 'nointegrity'))
          .pipe(new HeadTransformStream('https://man.hwangsehyun.com', replacedUrl)),
      );
      // console.error(html);
      const { origin: url } = new URL(replacedUrl);
      return printer.renderPdf({
        url,
        html,
      });
    }));
    spinner.succeed('Processed');

    const merger = new PDFMerger();
    // eslint-disable-next-line no-restricted-syntax
    for (const pdf of pdfs)
      // eslint-disable-next-line no-await-in-loop
      await merger.add(pdf);

    return Promise.all([
      merger.save('/dev/stdout'),
      // new Promise((resolve, reject) => process.stdout.write(output, error => {
      //   error ? reject(error) : resolve();
      // })),
      new Promise((resolve, reject) => server.close(error => {
        error ? reject(error) : resolve();
      })),
      browser.close(),
    ]);
  });
