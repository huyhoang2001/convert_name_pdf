export function formatFooterDate(date: Date, language: 'EN' | 'VI') {
  const locale = language === 'VI' ? 'vi-VN' : 'en-US';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${weekday[0].toLocaleUpperCase(locale)}${weekday.slice(1)}, ${day}/${month}/${date.getFullYear()}`;
}

export const msUntilNextLocalDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
