import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarNotification, emptyNotificationState, markAllCalendarNotificationsRead, readCalendarNotificationState, setCalendarNotificationPreference, writeCalendarNotificationState } from '../src/calendarNotifications.ts';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const notification = (id, createdAt = '2026-11-08T00:00:00.000Z', kind = 'status') => ({ id, kind, createdAt, read: false, itemTitle: id });

test('notification history persists preferences and unread state, bounded to the newest 100', () => {
  const storage = memoryStorage();
  const state = { ...emptyNotificationState, notifications: Array.from({ length: 105 }, (_, i) => notification(String(i), new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString())) };
  assert.equal(writeCalendarNotificationState(storage, state), true);
  const restored = readCalendarNotificationState(storage);
  assert.equal(restored.notifications.length, 100);
  assert.equal(restored.notifications[0].id, '104');
  assert.equal(restored.notifications.at(-1).id, '5');
  assert.equal(restored.notifications.every(item => !item.read), true);
});

test('notification preferences filter new events and persist independently', () => {
  const storage = memoryStorage();
  const muted = setCalendarNotificationPreference(emptyNotificationState, 'backup', false);
  assert.equal(addCalendarNotification(muted, notification('backup-1', undefined, 'backup')), muted);
  const status = addCalendarNotification(muted, notification('status-1'));
  assert.equal(status.notifications.length, 1);
  writeCalendarNotificationState(storage, muted);
  assert.equal(readCalendarNotificationState(storage).preferences.backup, false);
});

test('notifications deduplicate by stable id and mark-all-read clears unread items', () => {
  const storage = memoryStorage();
  const withItem = addCalendarNotification(emptyNotificationState, notification('reminder-1', '2026-11-08T00:00:00Z', 'reminder'));
  assert.equal(addCalendarNotification(withItem, notification('reminder-1', '2026-11-08T00:00:00Z', 'reminder')), withItem);
  const read = markAllCalendarNotificationsRead(withItem);
  assert.equal(read.notifications.every(item => item.read), true);
  assert.equal(markAllCalendarNotificationsRead(read), read);
  writeCalendarNotificationState(storage, read);
  assert.equal(readCalendarNotificationState(storage).notifications[0].read, true);
});

test('malformed notification storage falls back to an empty state', () => {
  const storage = { getItem: () => '{bad json' };
  assert.deepEqual(readCalendarNotificationState(storage), emptyNotificationState);
});
