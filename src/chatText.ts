export function formatChatText(text: string) {
  return text
    .replace(/\\\*/g, '*')
    .replace(/^\\(#{1,6})(?=\s)/gm, '$1')
    .replace(/^(\s*\d+)\\\.(?=\s)/gm, '$1.')
    .replace(/&#x20;|&#32;|&nbsp;/gi, ' ')
    .replace(/^(\s*)\\-(?=\s)/gm, '$1-')
    .replace(/^ {3}-(?=\s)/gm, '    -')
    .replace(/(^|\s)\+{2,}(?=\s|$)/g, '$1');
}
