import assert from 'node:assert/strict';
import test from 'node:test';
import { compareReleaseVersions, nextReleaseRevision, parseReleaseVersion } from '../scripts/release-version.mjs';

test('four-part display revisions have numeric ordering and legacy revision zero', () => {
  assert.deepEqual(parseReleaseVersion('3.0.4'), { baseVersion: '3.0.4', revision: 0, displayVersion: '3.0.4' });
  for (const [older, newer] of [['3.0.4', '3.0.4.0001'], ['3.0.4.0001', '3.0.4.0002'], ['3.0.4.0002', '3.0.5'], ['3.0.4.9999', '3.0.5']]) {
    assert.equal(compareReleaseVersions(older, newer), -1);
    assert.equal(compareReleaseVersions(newer, older), 1);
  }
});

test('revision selection ignores versions on other bases and preserves occupied identities', () => {
  assert.equal(nextReleaseRevision('3.0.4', ['v3.0.4', 'v3.0.4.0001', 'v3.0.5', 'v3.0.6']), '3.0.4.0002');
  assert.equal(nextReleaseRevision('3.0.4', ['v3.0.5', 'v3.0.6']), '3.0.4.0001');
  assert.throws(() => nextReleaseRevision('3.0.4', ['v3.0.4.9999']));
});

test('malformed and ambiguous release versions are rejected', () => {
  for (const value of ['3.0', '03.0.4', '3.0.4.-1', '3.0.4.0000', '3.0.4.001', '3.0.4.00001', '3.0.4.10000', '3.0.4+meta', '3.0.4.1']) {
    assert.throws(() => parseReleaseVersion(value));
  }
});
