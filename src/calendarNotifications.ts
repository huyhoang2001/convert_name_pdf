export type NotificationKind = 'status' | 'reminder' | 'backup';
export type NotificationPreferences = Record<NotificationKind, boolean>;
export type CalendarNotification = {
  id: string;
  kind: NotificationKind;
  createdAt: string;
  read: boolean;
  itemTitle?: string;
  fromStatus?: string;
  toStatus?: string;
  action?: 'export' | 'import';
  outcome?: 'success' | 'failure';
};
export type CalendarNotificationState = { notifications: CalendarNotification[]; preferences: NotificationPreferences };

export const CALENDAR_NOTIFICATIONS_KEY = 'b6h-calendar-notifications-v1';
export const defaultNotificationPreferences: NotificationPreferences = { status: true, reminder: true, backup: true };
export const emptyNotificationState: CalendarNotificationState = { notifications: [], preferences: defaultNotificationPreferences };
const kinds: NotificationKind[] = ['status', 'reminder', 'backup'];
const statuses = ['todo', 'in_progress', 'in_review', 'done'];
const validNotification = (value: unknown): value is CalendarNotification => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CalendarNotification>;
  return typeof item.id === 'string' && kinds.includes(item.kind as NotificationKind) && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) && typeof item.read === 'boolean'
    && (item.itemTitle === undefined || typeof item.itemTitle === 'string')
    && (item.fromStatus === undefined || statuses.includes(item.fromStatus))
    && (item.toStatus === undefined || statuses.includes(item.toStatus))
    && (item.action === undefined || item.action === 'export' || item.action === 'import')
    && (item.outcome === undefined || item.outcome === 'success' || item.outcome === 'failure');
};

export function readCalendarNotificationState(storage: Pick<Storage, 'getItem'>): CalendarNotificationState {
  try {
    const parsed = JSON.parse(storage.getItem(CALENDAR_NOTIFICATIONS_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return emptyNotificationState;
    const notifications = Array.isArray(parsed.notifications) ? parsed.notifications.filter(validNotification).sort((a: CalendarNotification, b: CalendarNotification) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100) : [];
    const saved = parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : {};
    return { notifications, preferences: Object.fromEntries(kinds.map(kind => [kind, typeof saved[kind] === 'boolean' ? saved[kind] : true])) as NotificationPreferences };
  } catch { return emptyNotificationState; }
}

export function writeCalendarNotificationState(storage: Pick<Storage, 'setItem'>, state: CalendarNotificationState): boolean {
  try {
    const notifications = state.notifications.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
    storage.setItem(CALENDAR_NOTIFICATIONS_KEY, JSON.stringify({ notifications, preferences: state.preferences }));
    return true;
  } catch { return false; }
}

export function addCalendarNotification(state: CalendarNotificationState, notification: CalendarNotification): CalendarNotificationState {
  if (!state.preferences[notification.kind] || state.notifications.some(item => item.id === notification.id)) return state;
  return { ...state, notifications: [notification, ...state.notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100) };
}

export function markAllCalendarNotificationsRead(state: CalendarNotificationState): CalendarNotificationState {
  if (state.notifications.every(item => item.read)) return state;
  return { ...state, notifications: state.notifications.map(item => ({ ...item, read: true })) };
}

export function markCalendarNotificationRead(state: CalendarNotificationState, id: string): CalendarNotificationState {
  const index = state.notifications.findIndex(item => item.id === id && !item.read);
  if (index < 0) return state;
  const notifications = state.notifications.slice();
  notifications[index] = { ...notifications[index], read: true };
  return { ...state, notifications };
}

export function setCalendarNotificationPreference(state: CalendarNotificationState, kind: NotificationKind, enabled: boolean): CalendarNotificationState {
  if (state.preferences[kind] === enabled) return state;
  return { ...state, preferences: { ...state.preferences, [kind]: enabled } };
}
