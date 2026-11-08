export type Status = 'todo' | 'in_progress' | 'in_review' | 'done';
export type Item = { id: string; kind: 'task' | 'event'; title: string; description: string; category: string; status: Status; priority: 'normal' | 'medium' | 'high' | 'urgent'; start: string; due: string; endTime: string; allDay: boolean; reminder: number; recurrence: string; checklist: { id: string; title: string; done: boolean }[]; progress: number; createdAt: string; updatedAt: string; originalStart?: string; firstCompletedAt?: string; completedAt?: string; completionObservedAt?: string; statusHistory?: { status: Status; changedAt: string }[] };

const DAY = 86400000;
const dateNumber = (key: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const year = Number(key.slice(0, 4)), month = Number(key.slice(5, 7)), day = Number(key.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month - 1)) return NaN;
  return Date.UTC(year, month - 1, day);
};
const keyFromNumber = (time: number) => new Date(time).toISOString().slice(0, 10);
const lastDayOfMonth = (year: number, month: number) => [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
const itemStart = (item: Item) => (item.originalStart ?? item.start ?? item.due).slice(0, 10);
const recurrenceDates = (recurrence: string, base: string, first: string, last: string): string[] => {
  const baseTime = dateNumber(base), firstTime = Math.max(dateNumber(first), baseTime), lastTime = dateNumber(last);
  if (!Number.isFinite(baseTime) || !Number.isFinite(firstTime) || !Number.isFinite(lastTime) || firstTime > lastTime) return [];
  const dates: string[] = [];
  if (recurrence === 'daily' || recurrence === 'weekly') {
    const step = recurrence === 'daily' ? 1 : 7;
    let time = baseTime + Math.ceil((firstTime - baseTime) / (step * DAY)) * step * DAY;
    for (; time <= lastTime; time += step * DAY) dates.push(keyFromNumber(time));
  } else if (recurrence === 'monthly') {
    const baseDate = new Date(baseTime), firstDate = new Date(firstTime), lastDate = new Date(lastTime);
    let month = Math.max(baseDate.getUTCFullYear() * 12 + baseDate.getUTCMonth(), firstDate.getUTCFullYear() * 12 + firstDate.getUTCMonth());
    const lastMonth = lastDate.getUTCFullYear() * 12 + lastDate.getUTCMonth();
    for (; month <= lastMonth; month++) {
      const year = Math.floor(month / 12), monthIndex = month % 12;
      const day = baseDate.getUTCDate();
      if (day > lastDayOfMonth(year, monthIndex)) continue;
      const time = Date.UTC(year, monthIndex, day);
      if (time >= firstTime && time <= lastTime) dates.push(keyFromNumber(time));
    }
  } else if (recurrence === 'yearly') {
    const baseDate = new Date(baseTime), firstDate = new Date(firstTime), lastDate = new Date(lastTime);
    for (let year = Math.max(baseDate.getUTCFullYear(), firstDate.getUTCFullYear()); year <= lastDate.getUTCFullYear(); year++) {
      const month = baseDate.getUTCMonth(), day = baseDate.getUTCDate();
      if (day > lastDayOfMonth(year, month)) continue;
      const time = Date.UTC(year, month, day);
      if (time >= firstTime && time <= lastTime) dates.push(keyFromNumber(time));
    }
  }
  return dates;
};

export const boardDoneVisible = (item: Pick<Item, 'completedAt' | 'completionObservedAt'>, now = Date.now()) => {
  const stamp = Date.parse(item.completedAt ?? item.completionObservedAt ?? '');
  const age = now - stamp;
  return Number.isFinite(stamp) && age >= 0 && age < 72 * 60 * 60 * 1000;
};

export const itemsByDate = (items: Item[], dates: string[]): Map<string, Item[]> => {
  const first = dates[0], last = dates.at(-1);
  const firstTime = first ? dateNumber(first) : NaN, lastTime = last ? dateNumber(last) : NaN;
  const byDate = new Map<string, Map<string, Item>>();
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const add = (item: Item, key: string) => {
    let day = byDate.get(key);
    if (!day) byDate.set(key, day = new Map());
    day.set(item.id, item);
  };
  const addSpan = (item: Item, start: string, end: string) => {
    const startTime = dateNumber(start), endTime = dateNumber(end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < firstTime || startTime > lastTime) return;
    for (let time = Math.max(startTime, firstTime); time <= Math.min(endTime, lastTime); time += DAY) add(item, keyFromNumber(time));
  };

  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || firstTime > lastTime) return new Map();
  for (const item of items) {
    const base = itemStart(item), baseTime = dateNumber(base), end = (item.due || item.start || base).slice(0, 10);
    const endTime = dateNumber(end);
    if (!Number.isFinite(baseTime) || !Number.isFinite(endTime)) continue;
    if (item.kind === 'task') {
      if (item.recurrence) for (const date of recurrenceDates(item.recurrence, base, first!, last!)) add(item, date);
      else if (dateIndex.has(base)) add(item, base);
      if (dateIndex.has(end)) add(item, end);
      continue;
    }
    if (!item.recurrence || !['daily', 'weekly', 'monthly', 'yearly'].includes(item.recurrence)) {
      const from = dateIndex.get(base), to = dateIndex.get(end);
      if (from !== undefined && to !== undefined) for (let i = from; i <= to; i++) add(item, dates[i]);
      else addSpan(item, base, end);
      continue;
    }

    const duration = Math.max(0, Math.floor((endTime - baseTime) / DAY));
    const cadenceGap = item.recurrence === 'daily' ? 1 : item.recurrence === 'weekly' ? 7 : item.recurrence === 'monthly' ? 62 : item.recurrence === 'yearly' ? 1461 : Infinity;
    if (duration >= cadenceGap) {
      addSpan(item, base, last!);
      continue;
    }
    const recurrenceStart = keyFromNumber(Math.max(baseTime, firstTime - duration * DAY));
    for (const start of recurrenceDates(item.recurrence, base, recurrenceStart, last!)) {
      const startTime = dateNumber(start);
      addSpan(item, start, keyFromNumber(startTime + duration * DAY));
    }
  }
  return new Map([...byDate].map(([date, values]) => [date, [...values.values()]]));
};
