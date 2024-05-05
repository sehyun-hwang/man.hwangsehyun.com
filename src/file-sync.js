import { execFile, spawn } from 'child_process';
import {
  mkdir, readFile, unlink, writeFile,
} from 'fs/promises';
import { createInterface } from 'readline';

import YAML from 'yaml';
import { glob } from 'glob';
import setDifference from 'set.prototype.difference';

import { HUGO_CONTENT_DIR } from './path.js';

const HUGO_CONFIG_PATH = 'hugo.yml';
const HUGO_CONFIG_GENERATED_PATH = 'config/_default/hugo.json';

const gzipFiles = paths => new Promise((resolve, reject) => {
  console.log('gzip', paths.length);
  const childProcess = execFile('gzip', [
    '-fkn8',
    ...paths,
  ], (error, stdout, stderr) => {
    console.log({ stdout, stderr });
    error ? reject(error) : resolve(childProcess.exitCode);
  });
})
  .then(code => (code ? Promise.reject(new Error(`gzip exited with code: ${code}`))
    : paths.map(path => path + '.gz')));

async function calculateInvalidChecksums(gzips) {
  /** @type {string[]} */
  const invalidPaths = [];

  const childProcess = spawn('md5sum', ['-c'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const readline = createInterface({
    input: childProcess.stdout,
  })
    .on('line', line => {
      if (line.endsWith(': OK'))
        return;
      const path = line.replace(/: FAILED$/, '');
      if (line === path)
        throw new Error('Unable to parse md5sum stdout:', line);
      invalidPaths.push(path);
    });

  gzips.forEach(path => {
    const matches = path.match(/.([^.]{32}).generated.md.gz$/);
    if (!matches) {
      console.log('Invalid file name, should delete', path);
      invalidPaths.push(path);
      return;
    }
    childProcess.stdin.write(matches[1]);
    childProcess.stdin.write(' ');
    childProcess.stdin.write(path);
    childProcess.stdin.write('\n');
  });
  childProcess.stdin.end();

  await new Promise(resolve => childProcess
    .on('exit', code => {
      console.log('md5sum exit code', code);
      resolve();
    }));

  readline.on('close', () => console.log('close'));
  return invalidPaths;
}

const addHugoMount = sources => readFile(HUGO_CONFIG_PATH, 'utf-8')
  .then(YAML.parse)
  .then(({ module }) => {
    const hugoConfigFolder = HUGO_CONFIG_GENERATED_PATH.replace('/hugo.json', '');
    const hugoConfig = {
      module: {
        mounts: sources.map(source => ({
          source,
          target: source.replace('/index', '').replace(/\w{32}.generated.md/, 'md'),
        }))
          .concat(module.mounts),
      },
    };
    console.log(HUGO_CONFIG_GENERATED_PATH, hugoConfig);
    return mkdir(hugoConfigFolder, { recursive: true })
      .then(() => writeFile(HUGO_CONFIG_GENERATED_PATH, JSON.stringify(hugoConfig)));
  });

export const replaceHugoMount = (pattern, replacement) => readFile(HUGO_CONFIG_GENERATED_PATH, 'utf-8')
  .then(original => {
    const replaced = original.replace(pattern, replacement);
    if (replaced === original)
      return Promise.resolve();
    return writeFile(HUGO_CONFIG_GENERATED_PATH, replaced);
  });

export default class FileSynchronizer {
  /** @type {StackEditPath[]} */
  requiredPaths;

  /** @type {Promise<String[]>} */
  localMarkdownsPromise;

  /** @type {String[]} */
  invalidPaths = [];

  /** @type {Set<string>} */
  deleteCandidates = new Set();

  /** @type {Set<string>} */
  downloadCandidates = new Set();

  constructor(stackEditPaths) {
    this.requiredPaths = stackEditPaths;
    this.localMarkdownsPromise = glob(HUGO_CONTENT_DIR + '/**/*.generated.md');
  }

  async processInvalidChecksums() {
    const localMarkdowns = await this.localMarkdownsPromise;
    if (!localMarkdowns.length)
      return;
    const gzips = await gzipFiles(localMarkdowns);
    this.invalidPaths = (await calculateInvalidChecksums(gzips)).map(path => path.replace(/.gz$/, ''));
  }

  async calculate() {
    const { requiredPaths, invalidPaths } = this;
    const localPaths = await this.localMarkdownsPromise;
    const required = new Set(requiredPaths.map(({ markdownPath }) => markdownPath));
    const local = new Set(localPaths);

    const deleteCandidates = setDifference(local, required);
    const downloadCandidates = setDifference(required, local);
    invalidPaths.forEach(path => (required.has(path)
      ? downloadCandidates.add(path) : deleteCandidates.add(path)));

    const results = { invalidPaths, deleteCandidates, downloadCandidates };
    console.log(results);
    Object.assign(this, results);
    return results;
  }

  prune() {
    console.log('Pruning', this.deleteCandidates);
    return Promise.all(Array.from(this.deleteCandidates, unlink));
  }

  * generateDownloadCandidates() {
    const pathMap = new Map(this.requiredPaths.map(path => [path.markdownPath, path]));
    // eslint-disable-next-line no-restricted-syntax
    for (const path of this.downloadCandidates)
      yield pathMap.get(path);
  }

  writeHugoConfig() {
    const sources = this.requiredPaths.filter(({ names }) => {
      const fileName = names.at(-1);
      if (fileName === '_index')
        return true;
      if (names.at(-2) !== '_index')
        return false;
      return fileName.startsWith('index.');
    })
      .map(({ markdownPath }) => markdownPath);
    console.log(HUGO_CONFIG_GENERATED_PATH, 'module.mounts.source list', sources);
    return addHugoMount(sources);
  }
}
