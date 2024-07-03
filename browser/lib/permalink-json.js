import { readFile } from 'fs/promises';

export default () => readFile('public/index.json', 'utf-8')
  .then(JSON.parse)
  .then(pages => pages.map(({ permalink }) => {
    let { pathname } = new URL(permalink);
    pathname = 'public/' + pathname;
    if (!pathname.endsWith('/'))
      return pathname;
    return pathname + 'index.html';
  }));
