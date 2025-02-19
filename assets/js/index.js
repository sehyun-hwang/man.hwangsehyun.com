import { install } from 'ga-gtag';

// Substitute your tracking ID (begins with "G-", "UA-", "AW-" or "DC-")
navigator.webdriver || install('G-0L26XYYVKB');

const hugoData = JSON.parse(document.querySelector('#hugo-json').textContent);
console.log('Data from hugo', hugoData);

const mermaidPromise = hugoData.mermaid
  // eslint-disable-next-line import/no-unresolved
  ? import('https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs')
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        theme: document.body.classList.contains('dark') && 'dark',
        startOnLoad: false,
      });
      return mermaid.run({ querySelector: '.language-mermaid' });
    })
    .catch(console.error) : Promise.resolve();

mermaidPromise.then(window.PagedConfig?.mermaidResolvers?.resolve);

const mybutton = document.getElementById('top-link');
window.addEventListener('click', () => {
  if (document.body.scrollTop > 800 || document.documentElement.scrollTop > 800) {
    mybutton.style.visibility = 'visible';
    mybutton.style.opacity = '1';
  } else {
    mybutton.style.visibility = 'hidden';
    mybutton.style.opacity = '0';
  }
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  if (document.body.className.includes('dark')) {
    document.body.classList.remove('dark');
    localStorage.setItem('pref-theme', 'light');
  } else {
    document.body.classList.add('dark');
    localStorage.setItem('pref-theme', 'dark');
  }
});

hugoData.highlightCode && document.querySelectorAll('pre > code').forEach(codeblock => {
  const container = codeblock.parentNode.parentNode;

  const copybutton = document.createElement('button');
  copybutton.classList.add('copy-code');
  copybutton.innerHTML = hugoData.i18n.code_copy;

  function copyingDone() {
    copybutton.innerHTML = hugoData.i18n.code_copied;
    setTimeout(() => {
      copybutton.innerHTML = hugoData.i18n.code_copy;
    }, 2000);
  }

  copybutton.addEventListener('click', cb => {
    if ('clipboard' in navigator) {
      navigator.clipboard.writeText(codeblock.textContent);
      copyingDone();
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(codeblock);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      document.execCommand('copy');
      copyingDone();
    } catch (error) {
      console.error(error);
    }
    selection.removeRange(range);
  });

  if (container.classList.contains('highlight')) {
    container.appendChild(copybutton);
  } else if (container.parentNode.firstChild === container) {
    // td containing LineNos
  } else if (codeblock.parentNode.parentNode.parentNode.parentNode.parentNode.nodeName === 'TABLE') {
    // table containing LineNos and code
    codeblock.parentNode.parentNode.parentNode.parentNode.parentNode.appendChild(copybutton);
  } else {
    // code blocks not having highlight as parent class
    codeblock.parentNode.appendChild(copybutton);
  }
});

const { href: pdfHref } = document.querySelector('link[rel="alternate"][type="application/pdf"]');
const downloadButtonElement = document.querySelector('a[href$="#download"]');
downloadButtonElement.removeAttribute('href');
downloadButtonElement.id = 'download-menu';
downloadButtonElement.href = pdfHref;
downloadButtonElement.download = document.title + '.pdf';

downloadButtonElement.addEventListener('click', event => {
  event.preventDefault();
  window.PagedConfig?.buttonResolvers?.resolve();
  setTimeout(() => window.PagedPolyfill.preview());
});

navigator.webdriver && document.querySelectorAll('img[loading="lazy"]')
  .forEach(img => {
    // eslint-disable-next-line no-param-reassign
    img.loading = 'eager';
  });

if (localStorage.getItem('download-tooltip'))
  document.querySelector('#download-tooltip').remove();
else
  document.querySelector('#download-tooltip button')
    .addEventListener('click', ({ target }) => {
      target.parentElement.remove();
      localStorage.setItem('download-tooltip', true);
    });

console.log('done');
