import type { TemplateEntry } from './bridge';

export function filterTemplates(rows: readonly TemplateEntry[], favoritesOnly: boolean, query: string, locale: string) {
  const search = query.trim().toLocaleLowerCase(locale);
  return rows.filter(row => (!favoritesOnly || row.pinned) && (!search || `${row.name} ${row.topic} ${row.kind}`.toLocaleLowerCase(locale).includes(search)));
}
