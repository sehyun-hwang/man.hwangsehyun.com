import { readFile } from 'fs/promises';

export default port => readFile('public/index.json', 'utf-8')
  .then(JSON.parse)
  .then(pages => pages.map(({ permalink }) => {
    const { pathname } = new URL(permalink);
    return `http://localhost:${port}${pathname}`;
  }));
