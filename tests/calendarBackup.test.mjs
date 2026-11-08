import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCalendarBackup } from '../src/calendarBackup.ts';

test('calendar backup writes to the selected local path', async () => {
  const writes = [];
  const saved = await saveCalendarBackup(
    '{"items":[]}',
    async filename => {
      assert.equal(filename, 'b6h-calendar-backup.json');
      return 'C:\\Users\\test\\Documents\\calendar.json';
    },
    async (path, contents) => writes.push({ path, contents }),
  );
  assert.equal(saved, true);
  assert.deepEqual(writes, [{ path: 'C:\\Users\\test\\Documents\\calendar.json', contents: '{"items":[]}' }]);
});

test('canceling the save dialog neither writes nor reports a saved backup', async () => {
  let writeCalled = false;
  const saved = await saveCalendarBackup('{"items":[]}', async () => null, async () => { writeCalled = true; });
  assert.equal(saved, false);
  assert.equal(writeCalled, false);
});

test('calendar backup surfaces file write failures', async () => {
  await assert.rejects(
    saveCalendarBackup('{"items":[]}', async () => 'calendar.json', async () => { throw new Error('disk full'); }),
    /disk full/,
  );
});
