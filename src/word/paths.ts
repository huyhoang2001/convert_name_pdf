export function displayWordPath(path: string): string {
  if (/^\\\\\?\\UNC\\/i.test(path)) return `\\\\${path.slice(8)}`;
  return path.replace(/^\\\\\?\\(?=[a-z]:\\)/i, '');
}
