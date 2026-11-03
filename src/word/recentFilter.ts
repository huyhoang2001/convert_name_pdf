import type { RecentDocument } from './bridge';

export function filterRecentDocuments(rows: readonly RecentDocument[], favoritesOnly: boolean, filter: 'all' | 'managed' | 'other') {
  return rows.filter(row => (!favoritesOnly || row.pinned === true) && (filter === 'all' || (filter === 'managed' ? row.managed === true : row.managed !== true)));
}
