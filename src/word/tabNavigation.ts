export function adjacentTabId(tabIds: readonly string[], activeId: string, direction: -1 | 1): string | null {
  if (tabIds.length < 2) return null;
  const index = tabIds.indexOf(activeId);
  if (index < 0) return null;
  return tabIds[(index + direction + tabIds.length) % tabIds.length] ?? null;
}
