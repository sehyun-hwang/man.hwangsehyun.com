import assert from 'node:assert/strict';
import test from 'node:test';

import YAML from 'yaml';

import { migrateFrontMatter } from './hugo-content.js';

test('migrates language-specific cascades without changing Markdown content', () => {
  const body = '\r\n# Unchanged\r\n{{< details >}}\r\n';
  const markdown = `---\r\ncascade:\r\n- _target:\r\n    kind: page\r\n    lang: kp\r\n  params:\r\n    title: 문화어\r\n- target:\r\n    lang: kr\r\n  params:\r\n    title: 한국어\r\n---${body}`;
  const converted = migrateFrontMatter(markdown);
  const frontMatter = YAML.parse(converted.split(/\r?\n---/)[0].replace(/^---\r?\n/, ''));
  assert.deepEqual(frontMatter.cascade[0].target, {
    kind: 'page', sites: { matrix: { languages: ['kp'] } },
  });
  assert.deepEqual(frontMatter.cascade[1].target.sites.matrix.languages, ['kr']);
  assert.ok(converted.endsWith(body));
  assert.equal(migrateFrontMatter(converted), converted);
});

test('converts legacy page language and a single cascade map', () => {
  const converted = migrateFrontMatter('---\nlang: kr\ncascade:\n  _target:\n    lang: kr\n  params:\n    flag: true\n---\nBody');
  const frontMatter = YAML.parse(converted.split('\n---')[0].slice(4));
  assert.deepEqual(frontMatter.sites.matrix.languages, ['kr']);
  assert.deepEqual(frontMatter.cascade.target.sites.matrix.languages, ['kr']);
  assert.equal(frontMatter.lang, undefined);
});

test('leaves modern front matter and content without front matter untouched', () => {
  ['# Body\n', '---\ntitle: Example\n---\nBody\n'].forEach(markdown => {
    assert.equal(migrateFrontMatter(markdown), markdown);
  });
});
