import { spawn } from 'child_process';

import { glob } from 'glob';
import setDifference from 'set.prototype.difference';

// eslint-disable-next-line no-unused-vars
import StackEditPath, { HUGO_CONTENT_DIR } from './path.js';

export default class FileSynchronizer {
  /**
   * @type {StackEditPath[]}
   */
  correctPaths;

  /**
   * @type {String[]}
   */
  localPaths;

  constructor(stackEditPaths) {
    this.correctPaths = stackEditPaths;
  }

  async calculate() {
    const localPaths = await glob(HUGO_CONTENT_DIR + '/**/*.generated.md');
    const correct = new Set(this.correctPaths.map(({ markdownPath }) => markdownPath));
    const local = new Set(localPaths);

    const deleteCandidates = setDifference(local, correct);
    const downloadCandidates = setDifference(correct, local);
    const results = { localPaths, deleteCandidates, downloadCandidates };
    console.log(results);
    Object.assign(this, results);
  }

  async calculateInvalidChecksums() {
    const { deleteCandidates } = this;
    const childProcess = spawn('md5sum', ['-c'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    childProcess.stdout.on('data', line => console.log(line.toString()));
    this.localPaths.forEach(path => {
      const matches = path.match(/.([^.]{32}).generated.md$/);
      if (!matches) {
        console.log('Invalid file name, deleting', path);
        deleteCandidates.add(path);
        return;
      }
      const checksumLine = matches[1] + ' ' + path + '\n';
      console.log(checksumLine);
      childProcess.stdin.write(checksumLine);
    });
    childProcess.stdin.end();

    await new Promise((resolve, reject) => childProcess
      .on('exit', code => {
        code ? reject(code) : resolve();
      }));
  }

  async processInvalidChecksums() {
    this.calculateInvalidChecksums();
  }

  * generateDownloadCandidates() {
    const pathMap = new Map(this.correctPaths.map(path => [path.markdownPath, path]));
    // eslint-disable-next-line no-restricted-syntax
    for (const path of this.downloadCandidates)
      yield pathMap.get(path);
  }
}
