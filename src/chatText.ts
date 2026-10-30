export function formatChatText(text: string) {
  const cleaned = text
    .replace(/\\\*/g, '*')
    .replace(/^\\(#{1,6})(?=\s)/gm, '$1')
    .replace(/^(\s*\d+)\\\.(?=\s)/gm, '$1.')
    .replace(/&#x20;|&#32;|&nbsp;/gi, ' ')
    .replace(/^(\s*)\\-(?=\s)/gm, '$1-')
    .replace(/^ {3}-(?=\s)/gm, '    -')
    .replace(/(^|\s)\+{2,}(?=\s|$)/g, '$1');

  let fence = false;
  return cleaned.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return line;

    const parts = line.split(/\|\s+\|/);
    if (parts.length < 3) return line;
    const rows = parts.map((part, index) => `${index ? '|' : ''}${part.trim()}${index < parts.length - 1 ? '|' : ''}`.replace(/^\\\|/, '|'));
    if (!/^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/.test(rows[1])) return line;
    const columns = (rows[0].match(/\|/g) ?? []).length;
    if (!rows.every(row => (row.match(/\|/g) ?? []).length === columns)) return line;
    return `\n${rows.join('\n')}`;
  }).join('\n');
}
