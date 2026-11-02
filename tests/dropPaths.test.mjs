import test from 'node:test';
import assert from 'node:assert/strict';
import { folderPathsFromDrop } from '../src/desktop/dropPaths.ts';

test('Count reads folder paths from Tauri drop events', () => {
  assert.deepEqual(folderPathsFromDrop({ paths: ['C:\\A', 'C:\\B'], position: { x: 0, y: 0 } }), ['C:\\A', 'C:\\B']);
  for (const detail of [null, [], { paths: [] }, { paths: [''] }, { paths: [123] }]) {
    assert.equal(folderPathsFromDrop(detail), null);
  }
});
