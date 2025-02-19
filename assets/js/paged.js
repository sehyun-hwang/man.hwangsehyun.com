/* eslint-disable no-plusplus */
/* eslint-disable no-loop-func */
/* eslint-disable max-classes-per-file */

import 'pagedjs';

// making it a hook to run inside paged.js and not before

function createToc(config) {
  const { content } = config;
  const { tocElement } = config;
  const { titleElements } = config;

  const tocElementDiv = content.querySelector(tocElement);
  if (!tocElementDiv) {
    console.warn('couldn’t start the toc');
    return;
  }
  tocElementDiv.innerHTML = '';
  const tocUl = document.createElement('ul');
  tocUl.id = 'list-toc-generated';
  tocElementDiv.appendChild(tocUl);

  // add class to all title elements
  let tocElementNbr = 0;
  for (let i = 0; i < titleElements.length; i++) {
    const titleHierarchy = i + 1;
    const titleElement = content.querySelectorAll(titleElements[i]);

    titleElement.forEach(element => {
      // check if should be shown
      if (
        !(
          element.closest('section').classList.contains('toc-ignore')
          || element.closest('section').classList.contains('toc')
        )
      ) {
        // add classes to the element
        element.classList.add('title-element');
        element.setAttribute('data-title-level', titleHierarchy);

        // add an id if doesn't exist
        tocElementNbr++;

        if (element.id === '') {
          element.id = 'title-element-' + tocElementNbr;
        }
        const newIdElement = element.id;
      }
    });
  }

  // create toc list
  const tocElements = content.querySelectorAll('.title-element');

  tocElements.forEach(tocElement => {
    const tocNewLi = document.createElement('li');

    // Add class for the hierarchy of toc
    tocNewLi.classList.add('toc-element');
    tocNewLi.classList.add('toc-element-level-' + tocElement.dataset.titleLevel);

    const classes = [
      ...tocElement.className.split(' '),
      ...(tocElement.closest('section')?.className?.split(' ') || []),
    ];

    classes.forEach(meta => {
      if (meta === 'title-element' || meta === undefined || meta === '')
        return;
      tocNewLi.classList.add(`toc-${meta}`);
    });

    // get the existing class
    // Keep class of title elements
    const classTocElement = tocElement.classList;
    // for (var n = 0; n < classTocElement.length; n++) {
    //   if (classTocElement[n] != 'title-element') {
    //     tocNewLi.classList.add(classTocElement[n])
    //   }
    // }

    // Create the element
    tocNewLi.innerHTML = '<a href="#' + tocElement.id + '">' + tocElement.innerHTML + '</a>';
    tocUl.appendChild(tocNewLi);
  });
}

/* global Paged */
console.log({ Paged, createToc });

class Handlers extends Paged.Handler {
  // eslint-disable-next-line class-methods-use-this
  beforeParsed(content) {
    console.log('beforeParsed');
    createToc({
      content,
      tocElement: '#toc',
      titleElements: ['.page-header h1', 'h1.post-title'],
    });
  }
}

class PagedConfig {
  constructor() {
    this.mermaidResolvers = Promise.withResolvers();
    this.buttonResolvers = Promise.withResolvers();
    navigator.webdriver && this.buttonResolvers.resolve();
  }

  async before() {
    const previewer = window.PagedPolyfill;
    previewer.registerHandlers(Handlers);

    const main = document.querySelector('main');
    await Promise.all([
      this.mermaidResolvers.promise,
      this.buttonResolvers.promise,
    ]);
    console.log('Replacing', main);
    main && document.body.replaceChildren(main);

    console.log(await Promise.allSettled(
      Array.prototype.map.call(main.querySelectorAll('img'), img => {
        if (img.complete)
          return Promise.resolve();
        img.loading = 'eager';
        return new Promise((resolve, reject) => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', reject);
        });
      }),
    ));

    document.querySelectorAll('.post-content iframe')
      .forEach(x => x.remove());
  }

  // eslint-disable-next-line class-methods-use-this
  after(flow) {
    console.log('after', flow);
  }
}

const config = new PagedConfig();
window.PagedConfig = config;
