import {
  cp, mkdir, readFile, readdir, rm, writeFile,
} from 'fs/promises';
import { dirname, join, relative } from 'path';
import { pathToFileURL } from 'url';

import YAML from 'yaml';

export const HUGO_CONFIG_GENERATED_PATH = 'config/_default/module.json';
const STAGED_CONTENT_DIR = 'resources/_gen/hugo-content';

// Cloudant filenames contain checksums of the original bytes. Convert only build copies.
export function migrateFrontMatter(markdown) {
  const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
  if (!match)
    return markdown;
  const document = YAML.parseDocument(match[2]);
  if (document.errors.length)
    throw document.errors[0];
  const frontMatter = document.toJS();
  let changed = false;
  if (frontMatter?.lang) {
    document.setIn(['sites', 'matrix', 'languages'], [frontMatter.lang]);
    document.delete('lang');
    changed = true;
  }
  if (frontMatter?.cascade) {
    const cascades = Array.isArray(frontMatter.cascade) ? frontMatter.cascade : [frontMatter.cascade];
    cascades.forEach((cascade, index) => {
      const key = cascade._target ? '_target' : 'target';
      const target = cascade[key];
      if (!target)
        return;
      const path = Array.isArray(frontMatter.cascade) ? ['cascade', index] : ['cascade'];
      if (target.lang) {
        document.setIn([...path, key, 'sites', 'matrix', 'languages'], [target.lang]);
        document.deleteIn([...path, key, 'lang']);
        changed = true;
      }
      if (key === '_target') {
        document.setIn([...path, 'target'], document.getIn([...path, key]));
        document.deleteIn([...path, key]);
        changed = true;
      }
    });
  }
  return changed
    ? match[1] + document.toString().trimEnd() + match[3] + markdown.slice(match[0].length)
    : markdown;
}

export async function writeHugoMounts() {
  const { module } = YAML.parse(await readFile('hugo.yml', 'utf8'));
  const mounts = module.mounts;
  await mkdir(dirname(HUGO_CONFIG_GENERATED_PATH), { recursive: true });
  await writeFile(HUGO_CONFIG_GENERATED_PATH, JSON.stringify({ mounts }));
}

export async function prepareHugoContent() {
  await rm(STAGED_CONTENT_DIR, { recursive: true, force: true });
  await mkdir(STAGED_CONTENT_DIR, { recursive: true });
  const entries = await readdir('content', { recursive: true, withFileTypes: true });
  await Promise.all(entries.filter(entry => entry.isFile() && !entry.name.endsWith('.gz') && entry.name !== '.DS_Store').map(async entry => {
    const source = join(entry.parentPath, entry.name);
    const logicalPath = relative('content', source)
      .replace(/^_index\/index\./, '_index.')
      .replace(/\.[a-f0-9]{32}\.generated\.md$/, '.md');
    const target = join(STAGED_CONTENT_DIR, logicalPath);
    await mkdir(dirname(target), { recursive: true });
    if (entry.name.endsWith('.md')) {
      let markdown = migrateFrontMatter(await readFile(source, 'utf8'));
      // Legacy section slugs named "index" override the directory route in modern Hugo.
      if (logicalPath.split('/').at(-1) === '_index.md')
        markdown = markdown.replace(/^(slug:\s*index\s*)$/m, '');
      await writeFile(target, markdown);
    } else {
      await cp(source, target);
    }
  }));
  const portfolioDir = join(STAGED_CONTENT_DIR, 'all');
  await mkdir(portfolioDir, { recursive: true });
  await Promise.all(Object.entries({ kr: '개발 포트폴리오', kp: '개발과제 자료집' }).map(([language, title]) =>
    writeFile(join(portfolioDir, `_index.${language}.md`), `---\ntitle: ${title}\nparams:\n  head_extensions:\n    - pagedjs_head.html\nbuild:\n  list: never\n---\n`)));
  await writeHugoMounts();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareHugoContent();
