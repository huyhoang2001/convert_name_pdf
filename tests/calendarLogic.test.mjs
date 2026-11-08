import test from 'node:test';
import assert from 'node:assert/strict';
import { boardDoneVisible, itemsByDate } from '../src/calendarLogic.ts';

const item = (overrides = {}) => ({ id: 'one', kind: 'task', title: 'Task', description: '', category: '', status: 'todo', priority: 'normal', start: '2024-01-31', due: '2024-01-31', endTime: '10:00', allDay: true, reminder: 0, recurrence: '', checklist: [], progress: 0, createdAt: '', updatedAt: '', ...overrides });
const days = (start, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));

test('Done visibility exactly matches the 72-hour window and rejects invalid or future timestamps', () => {
  const completedAt = '2026-11-01T00:00:00.000Z';
  const start = Date.parse(completedAt);
  assert.equal(boardDoneVisible({ completedAt }, start + 72 * 3600000 - 1), true);
  assert.equal(boardDoneVisible({ completedAt }, start + 72 * 3600000), false);
  assert.equal(boardDoneVisible({ completedAt }, start - 1), false);
  assert.equal(boardDoneVisible({ completedAt: 'invalid' }, start), false);
  assert.equal(boardDoneVisible({ completionObservedAt: completedAt }, start), true);
});

test('daily and weekly task recurrence is indexed only inside the visible range', () => {
  const dates = days('2026-11-08', 14);
  const result = itemsByDate([
    item({ recurrence: 'daily', start: '2026-01-01', due: '2026-01-01' }),
    item({ id: 'weekly', recurrence: 'weekly', start: '2026-11-01', due: '2026-11-01' }),
  ], dates);
  assert.equal(result.get('2026-11-08')?.length, 2);
  assert.equal(result.get('2026-11-09')?.length, 1);
  assert.equal(result.get('2026-11-15')?.some(value => value.id === 'weekly'), true);
});

test('monthly and yearly recurrence skip missing month and leap dates', () => {
  const dates = [...days('2024-02-01', 29), ...days('2024-03-01', 31), ...days('2025-02-01', 28), ...days('2028-02-01', 29)];
  const result = itemsByDate([
    item({ id: 'monthly', start: '2024-01-31', due: '2024-01-31', recurrence: 'monthly' }),
    item({ id: 'leap', start: '2024-02-29', due: '2024-02-29', recurrence: 'yearly' }),
  ], dates);
  assert.equal(result.get('2024-02-29')?.some(value => value.id === 'monthly') ?? false, false);
  assert.equal(result.get('2024-03-31')?.some(value => value.id === 'monthly'), true);
  assert.equal(result.get('2025-02-28')?.some(value => value.id === 'leap') ?? false, false);
  assert.equal(result.get('2028-02-29')?.some(value => value.id === 'leap'), true);
});

test('all recurrence intervals generate event occurrences within the visible range', () => {
  const events = [
    item({ id: 'daily-event', kind: 'event', start: '2026-11-08', due: '2026-11-08', recurrence: 'daily' }),
    item({ id: 'weekly-event', kind: 'event', start: '2026-11-01', due: '2026-11-01', recurrence: 'weekly' }),
    item({ id: 'monthly-event', kind: 'event', start: '2026-10-08', due: '2026-10-08', recurrence: 'monthly' }),
    item({ id: 'yearly-event', kind: 'event', start: '2025-11-08', due: '2025-11-08', recurrence: 'yearly' }),
  ];
  const result = itemsByDate(events, days('2026-11-08', 1));
  assert.deepEqual(result.get('2026-11-08')?.map(value => value.id).sort(), events.map(value => value.id).sort());
});

test('recurring events retain their multi-day span and locked start date', () => {
  const event = item({ id: 'event', kind: 'event', start: '2026-11-01T09:00:00-05:00', originalStart: '2026-11-01T09:00:00-05:00', due: '2026-11-02', recurrence: 'weekly' });
  const result = itemsByDate([event], days('2026-11-08', 14));
  assert.equal(result.get('2026-11-08')?.some(value => value.id === 'event'), true);
  assert.equal(result.get('2026-11-09')?.some(value => value.id === 'event'), true);
  assert.equal(result.get('2026-11-10')?.some(value => value.id === 'event') ?? false, false);
});

test('non-recurring multi-day events and task due-date display remain intact', () => {
  const result = itemsByDate([
    item({ id: 'event', kind: 'event', start: '2026-11-08', due: '2026-11-10' }),
    item({ id: 'task', start: '2026-11-01', due: '2026-11-09' }),
  ], days('2026-11-08', 3));
  assert.deepEqual(result.get('2026-11-08')?.map(value => value.id), ['event']);
  assert.deepEqual(result.get('2026-11-09')?.map(value => value.id), ['event', 'task']);
  assert.deepEqual(result.get('2026-11-10')?.map(value => value.id), ['event']);
});
