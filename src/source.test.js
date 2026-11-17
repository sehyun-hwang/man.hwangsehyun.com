import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import parser from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import { parseFrontMatters, runMarkdownLint } from './markdownlint.js';
import StackEditDomData from './dom-data.js';
import StackEditDomModel from './dom-model.js';
import { processFrontMatters } from './frontmatter.js';

test('parses YAML, TOML and absent frontmatter', async () => {
  const docs = await parseFrontMatters({ 1: '---\ntitle: YAML\n---\ntext', 2: '+++\ntitle = "TOML"\n+++\ntext', 3: 'text' });
  assert.deepEqual(docs.map(({ title, has }) => [title, has]), [['YAML', true], ['TOML', true], [undefined, false]]);
  assert.ok(await runMarkdownLint('# Title\n'));
});

test('streams rows using upgraded stream-json API', async () => {
  const rows = [];
  await pipeline(Readable.from(['{"rows":[{"id":"a"},{"id":"b"}]}']), parser(), pick.asStream({ filter: 'rows' }), streamArray.asStream(), new Writable({ objectMode: true, write(row, _encoding, callback) { rows.push(row.value.id); callback(); } }));
  assert.deepEqual(rows, ['a', 'b']);
});

test('builds DOM and rejects orphaned nodes', () => {
  const item = (id, parentId, type) => ({ _id: id, item: { id, parentId, type, name: id, hash: 1 } });
  const docs = [item('child', 'root', 'file'), item('root', null, 'folder')];
  const model = new StackEditDomModel(new StackEditDomData(docs).sortNodes());
  assert.deepEqual(model.getNamesFromId('child').filter(Boolean), ['root', 'child']);
  assert.throws(() => new StackEditDomData([item('orphan', 'missing', 'file')]).sortNodes(), /Orphaned/);
});

test('collects stale frontmatter after stream completes', async () => {
  const deleted = [];
  const cloudant = { constants: { db: 'test' }, client: { postBulkDocs: async ({ bulkDocs }) => deleted.push(...bulkDocs.docs) }, streamFrontMatters: writable => pipeline(Readable.from([{ value: { id: 'frontmatter.1', doc: { _id: 'frontmatter.1', _rev: '1' } } }, { value: { id: 'frontmatter.2', doc: { _id: 'frontmatter.2', _rev: '2' } } }]), writable) };
  const docs = await processFrontMatters(cloudant, new Map([[1, 'file']]));
  assert.equal(docs.length, 1);
  assert.deepEqual(deleted, [{ _id: 'frontmatter.2', _rev: '2', _deleted: true }]);
});
