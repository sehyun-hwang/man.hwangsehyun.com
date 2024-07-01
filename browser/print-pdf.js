import { createReadStream } from 'fs';
import { createServer } from 'http';
import { text } from 'stream/consumers';

import Printer from 'pagedjs-cli';
import handler from 'serve-handler';
import ora from 'ora';

import HeadTransformStream from './lib/head-transform-stream.js';
import launchBrowser from './lib/puppeteer-browser.js';

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
}

server.listen(0, async () => {
  const { port } = server.address();
  console.error('Server running at', port);
  const replacedUrl = `http://localhost:${port}`;

  const html = await text(
    createReadStream('public/project/llm-docs-search/index.html')
      .pipe(new HeadTransformStream('https://man.hwangsehyun.com', replacedUrl))
      .pipe(new HeadTransformStream('defer="TO_BE_REMOVED_IN_PUPPETTER"', '')),
  );
  // console.error(html);
  spinner.start('Loading: ');
  const printer = new BrowserlessPrinter(await launchBrowser());

  printer.on('page', page => {
    if (page.position === 0) {
      spinner.succeed('Loaded');
      spinner.start('Rendering: Page ' + (page.position + 1));
    } else {
      spinner.text = 'Rendering: Page ' + (page.position + 1);
    }
  });

  printer.on('rendered', msg => {
    spinner.succeed(msg);
    spinner.start('Generating');
  });

  printer.on('postprocessing', msg => {
    spinner.succeed('Generated');
    spinner.start('Processing');
  });

  // const output = await printer.render({ html })
  // .then(page => page.pdf());
  const output = await printer.pdf({ html }, { outlineTags: ['h2'] });
  console.error('PDF output', output.length);
  // output = replaceExt(output, '.html');

  spinner.succeed('Processed');
  return Promise.all([
    new Promise((resolve, reject) => process.stdout.write(output, error => {
      error ? reject(error) : resolve();
    })),
    new Promise((resolve, reject) => server.close(error => {
      error ? reject(error) : resolve();
    })),
    printer.browser.close(),
  ]);
});
