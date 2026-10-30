export const blankCopiesRow = () => ({ id: '', refNo: '', customer: '', description: '', quantity: '0', unitPrice: '0', totalAmount: '', manualTotal: false, manualRefNo: false });

export const decrementCopiesCount = (value: string) => String(Math.max(0, Number(value || 0) - 1));

export function copiesSuggestions(rows: { customer: string; description: string }[], field: 'customer' | 'description', query: string) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return [];
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const row of rows) {
    const value = row[field].trim(), key = value.toLocaleLowerCase();
    if (!value || key === search || !key.includes(search) || seen.has(key)) continue;
    seen.add(key);
    matches.push(value);
    if (matches.length === 5) break;
  }
  return matches;
}

export const isCopiesSaveShortcut = (event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey'>) => event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLocaleLowerCase() === 's';
