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

const hugoData = JSON.parse(document.querySelector('#hugo-json').value);
console.log('Data from hugo', hugoData);

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
    } catch (e) { }
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

hugoData.mermaid && import('https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs')
  .then(({ default: mermaid }) => {
    mermaid.initialize({
      theme: document.body.classList.contains('dark') && 'dark',
      startOnLoad: false,
    });
    mermaid.run({ querySelector: '.language-mermaid' });
  });
