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

  async globLocalPaths() {
    this.localPaths = await glob(HUGO_CONTENT_DIR + '/**/*.generated.md');
    return this.localPaths;
  }

  * sync() {
    const pathMap = new Map(this.correctPaths.map(path => [path.markdownPath, path]));
    const correct = new Set(this.correctPaths.map(({ markdownPath }) => markdownPath));
    const local = new Set(this.localPaths);

    const deleteCandidates = setDifference(local, correct);
    const downloadCandidates = setDifference(correct, local);
    const results = { deleteCandidates, downloadCandidates };
    console.log(results);
    Object.assign(this, results);

    // eslint-disable-next-line no-restricted-syntax
    for (const path of downloadCandidates)
      yield pathMap.get(path);
  }
}
