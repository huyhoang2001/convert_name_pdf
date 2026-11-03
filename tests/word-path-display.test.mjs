import test from 'node:test';
import assert from 'node:assert/strict';
import { displayWordPath } from '../src/word/paths.ts';

test('display paths hide Windows extended prefixes without changing file paths', () => {
  const drivePath = String.raw`\\?\C:\Users\hinmae\Documents\file.docx`;
  const uncPath = String.raw`\\?\UNC\server\share\file.docx`;
  assert.equal(displayWordPath(drivePath), String.raw`C:\Users\hinmae\Documents\file.docx`);
  assert.equal(displayWordPath(uncPath), String.raw`\\server\share\file.docx`);
  assert.equal(drivePath.startsWith('\\\\?\\'), true);
  assert.equal(displayWordPath(String.raw`C:\Users\file.docx`), String.raw`C:\Users\file.docx`);
});
