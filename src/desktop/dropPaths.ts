export function folderPathsFromDrop(detail: unknown): string[] | null {
  const paths = (detail as { paths?: unknown } | null)?.paths;
  return Array.isArray(paths) && paths.length > 0 && paths.every(path => typeof path === 'string' && path.length > 0) ? paths : null;
}
