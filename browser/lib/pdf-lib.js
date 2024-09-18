/* eslint-disable no-underscore-dangle */
import { PDFDict, PDFName } from 'pdf-lib';
import PDFMerger from 'pdf-merger-js';
import { setOutline } from 'pagedjs-cli';

const LINKS_PDF_NAME = PDFName.of('Dests');

function mapSourceToTargetPages(source, target, startingTargetPage) {
  const result = {};
  const targetPages = target.getPages();
  let currentTargetPage = startingTargetPage;
  const sourcePages = source.getPages();
  for (let i = 0; i < sourcePages.length; i++) {
    result[sourcePages[i].ref.tag] = targetPages[currentTargetPage].ref;
    currentTargetPage++;
  }
  return { mapping: result, targetPage: currentTargetPage };
}

/** @link https://github.com/Hopding/pdf-lib/issues/341#issuecomment-2242089158 */
function copyLinks(sources, target) {
  const targetLinksDict = PDFDict.withContext(target.context);
  let currentTargetPage = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const source of sources) {
    const { mapping, targetPage } = mapSourceToTargetPages(source, target, currentTargetPage);
    currentTargetPage = targetPage;
    const links = source.context.lookupMaybe(source.catalog.get(LINKS_PDF_NAME), PDFDict);
    if (links !== null) {
      links?.entries().forEach(([destName, destValue]) => {
        const currentRef = destValue.get(0);
        destValue.set(0, mapping[currentRef.tag]);
        targetLinksDict.set(destName, destValue);
      });
    }
  }
  const destinationDestsRef = target.context.register(targetLinksDict);
  target.catalog.set(LINKS_PDF_NAME, destinationDestsRef);
}

export default class PdflibMerger extends PDFMerger {
  outline = [];

  async _addPagesFromDocument(input, pages = undefined) {
    const copiedPages = await this._doc.copyPages(input, input.getPageIndices());
    copiedPages.forEach(page => {
      this._doc.addPage(page);
    });
  }

  setOutline(pdfDocs) {
    this.outline.forEach(x => { x.depth = 0; });
    setOutline(this._doc, this.outline, true);
    copyLinks(pdfDocs, this._doc);
  }
}
