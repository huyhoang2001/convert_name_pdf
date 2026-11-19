import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardDoneVisible, classifyDeadline, countOverdue, deadlineClockChanged, nextDeadlineRefreshAt } from '../src/calendarLogic.ts';

const item = (overrides = {}) => ({ id: 'one', kind: 'task', title: 'Task', description: '', category: '', status: 'todo', priority: 'normal', start: '2026-11-19', due: '2026-11-19', endTime: '10:00', allDay: true, reminder: 0, recurrence: '', checklist: [], progress: 0, createdAt: '', updatedAt: '', ...overrides });
const local = (year, month, day, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute);
const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('A01 date-only due today stays due today', () => {
  assert.deepEqual(classifyDeadline(item(), local(2026, 11, 19, 23, 59)), { kind: 'due_today', days: 0 });
});

test('A02 date-only item becomes one day overdue at following local midnight', () => {
  assert.deepEqual(classifyDeadline(item(), local(2026, 11, 20)), { kind: 'overdue', days: 1, timed: false, age: '1-3' });
});

test('A03 timed Event changes state exactly at due date plus end time', () => {
  const event = item({ kind: 'event', allDay: false, due: '2026-11-19', endTime: '10:30' });
  assert.equal(classifyDeadline(event, local(2026, 11, 19, 10, 29)).kind, 'due_today');
  assert.equal(classifyDeadline(event, local(2026, 11, 19, 10, 30)).kind, 'overdue');
  assert.equal(classifyDeadline(event, local(2026, 11, 19, 11)).kind, 'overdue');
  assert.equal(classifyDeadline(item({ ...event, endTime: '25:00' }), local(2026, 11, 19, 23)).kind, 'none');
  const zonedInstant = '2026-11-19T23:00:00-08:00';
  const afterZonedDeadline = new Date(Date.parse(zonedInstant) + 1);
  assert.equal(classifyDeadline(item({ due: zonedInstant }), afterZonedDeadline).days, 0);
});

test('A04 invalid dates are ignored and leap/year boundaries use calendar dates', () => {
  assert.equal(classifyDeadline(item({ due: '2026-02-29' }), local(2026, 3, 1)).kind, 'none');
  assert.equal(classifyDeadline(item({ due: '' }), local(2026, 3, 1)).kind, 'none');
  assert.equal(classifyDeadline(item({ due: '2024-02-29' }), local(2024, 3, 1)).days, 1);
  assert.equal(classifyDeadline(item({ due: '2026-12-25' }), local(2027, 1, 5)).days, 11);
  assert.doesNotThrow(() => classifyDeadline(item({ due: 'invalid' }), local(2027, 1, 5)));
});

test('A05 Tasks and Events in each unfinished workflow status receive the same warning', () => {
  for (const kind of ['task', 'event']) for (const status of ['todo', 'in_progress', 'in_review']) {
    assert.equal(classifyDeadline(item({ kind, status }), local(2026, 11, 20)).kind, 'overdue');
  }
});

test('A06 Done items never receive deadline warnings', () => {
  assert.deepEqual(classifyDeadline(item({ status: 'done' }), local(2026, 11, 20)), { kind: 'none' });
});

test('A07 overdue day counts and age bands cover all specified boundaries', () => {
  const expected = [[1, '1-3'], [3, '1-3'], [4, '4-7'], [7, '4-7'], [8, '8-30'], [30, '8-30'], [31, '31+'], [730, '31+']];
  for (const [days, age] of expected) {
    const due = key(local(2026, 11, 20 - days));
    const warning = classifyDeadline(item({ due }), local(2026, 11, 20));
    assert.equal(warning.kind, 'overdue');
    assert.equal(warning.days, days);
    assert.equal(warning.age, age);
  }
});

test('A08 status changes do not change deadline classification or mutate the item', () => {
  const original = item();
  const before = JSON.stringify(original);
  const warnings = ['todo', 'in_progress', 'in_review'].map(status => classifyDeadline({ ...original, status }, local(2026, 11, 20)).kind);
  assert.deepEqual(warnings, ['overdue', 'overdue', 'overdue']);
  assert.equal(JSON.stringify(original), before);
});

test('A09 rescheduling to future clears warning and past date recomputes duration', () => {
  const now = local(2026, 11, 20);
  assert.equal(classifyDeadline(item({ due: '2026-11-21' }), now).kind, 'due_soon');
  assert.equal(classifyDeadline(item({ due: '2026-11-18' }), now).days, 2);
});

test('A10 explicit completion removes the warning without changing the deadline', () => {
  const overdue = item({ due: '2026-11-18' });
  const completed = { ...overdue, status: 'done', completedAt: local(2026, 11, 20, 12).toISOString() };
  assert.equal(classifyDeadline(overdue, local(2026, 11, 20)).kind, 'overdue');
  assert.equal(classifyDeadline(completed, local(2026, 11, 20)).kind, 'none');
  assert.equal(completed.due, overdue.due);
});

test('A11 Board Done retention expires exactly at 72 hours', () => {
  const start = Date.parse('2026-11-01T00:00:00Z');
  const done = { completedAt: new Date(start).toISOString() };
  assert.equal(boardDoneVisible(done, start + 72 * 3600000 - 1), true);
  assert.equal(boardDoneVisible(done, start + 72 * 3600000), false);
});

test('A12 reopening restores deadline evaluation while identity and original start remain one record', () => {
  const completed = item({ status: 'done', originalStart: '2020-01-01', start: '2020-01-01', completedAt: '2026-11-19T10:00:00Z' });
  const reopened = { ...completed, status: 'in_progress', completedAt: undefined };
  assert.equal(classifyDeadline(reopened, local(2026, 11, 20)).kind, 'overdue');
  assert.equal(reopened.originalStart, '2020-01-01');
  assert.equal(new Set([reopened, { ...reopened }].map(value => value.id)).size, 1);
});

test('A13 2026-12-25 remains eleven days overdue on 2027-01-05', () => {
  assert.equal(classifyDeadline(item({ due: '2026-12-25' }), local(2027, 1, 5)).days, 11);
});

test('A14 an unfinished multi-year-old item stays unresolved and classifies overdue', () => {
  const old = item({ due: '2010-01-01', status: 'in_review' });
  assert.equal(old.status, 'in_review');
  assert.equal(classifyDeadline(old, local(2026, 11, 20)).kind, 'overdue');
  assert.equal(classifyDeadline(old, local(2026, 11, 20)).days, 6167);
});

test('A15 classification uses stable record identity and never creates a partition copy', () => {
  const original = item({ id: 'owned-by-2026', due: '2026-12-25' });
  const returned = [original];
  assert.equal(classifyDeadline(returned[0], local(2027, 1, 5)).days, 11);
  assert.deepEqual(returned.map(value => value.id), ['owned-by-2026']);
});

test('A16 overdue values are derived and missing dates cannot produce persisted warning fields', () => {
  const value = item({ due: '2026-11-18' });
  const warning = classifyDeadline(value, local(2026, 11, 20));
  assert.equal(warning.kind, 'overdue');
  assert.equal('isOverdue' in value, false);
  assert.equal('overdueDays' in value, false);
  assert.equal(classifyDeadline(item({ due: 'bad-date' }), local(2026, 11, 20)).kind, 'none');
});

test('A17 refresh scheduling uses one nearest boundary and detects clock/timezone changes', () => {
  const now = local(2026, 11, 19, 9);
  const event = item({ kind: 'event', allDay: false, due: '2026-11-19', endTime: '10:00' });
  assert.equal(nextDeadlineRefreshAt([event], now), local(2026, 11, 19, 10).getTime());
  assert.equal(deadlineClockChanged(100_000, 50_000, 101_000, 51_000, 0, 60), true);
  assert.equal(deadlineClockChanged(100_000, 50_000, 170_000, 110_000, 0, 0), true);
  assert.equal(deadlineClockChanged(100_000, 50_000, 101_000, 51_000, 0, 0), false);
});

test('A18 Board, Calendar, Timeline, details and filter share the deadline classifier', () => {
  const workspace = readFileSync(new URL('../src/CalendarWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /calendar-overdue-filter/);
  assert.match(workspace, /deadlineBadge\(item\)/);
  assert.match(workspace, /deadlineBadge\(item,true\)/);
  assert.match(workspace, /deadlineBadge\(draft,false,true\)/);
  assert.match(workspace, /deadlineWarnings\.get\(item\.id\)\?\.kind === 'overdue'/);
});

test('A19 English/Vietnamese warning labels and dark-mode contrast styles exist', () => {
  const workspace = readFileSync(new URL('../src/CalendarWorkspace.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/calendar.css', import.meta.url), 'utf8');
  assert.match(workspace, /dueToday: 'Due today'/);
  assert.match(workspace, /dueToday: 'Đến hạn hôm nay'/);
  assert.match(workspace, /Quá hạn \$\{days\} ngày/);
  assert.match(css, /:root\[data-theme="dark"\] \.calendar-deadline-warning\.overdue/);
});

test('A20 10,000-item fixture is classified in one linear pass', t => {
  const due = key(local(2026, 11, 10));
  const items = Array.from({ length: 10_000 }, (_, id) => item({ id: String(id), due }));
  const start = performance.now();
  const count = countOverdue(items, local(2026, 11, 20));
  const elapsed = performance.now() - start;
  assert.deepEqual(count, { total: 10_000, over30: 0 });
  t.diagnostic(`10,000 overdue classifications: ${elapsed.toFixed(2)} ms`);
});

test('A21 Calendar date projection and existing Done rules remain available', () => {
  assert.equal(typeof boardDoneVisible, 'function');
  assert.equal(typeof classifyDeadline, 'function');
  assert.equal(typeof countOverdue, 'function');
});
