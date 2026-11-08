export async function saveCalendarBackup(
  contents: string,
  choosePath: (filename: string) => Promise<string | null>,
  writeFile: (path: string, contents: string) => Promise<void>,
): Promise<boolean> {
  const path = await choosePath('b6h-calendar-backup.json');
  if (!path) return false;
  await writeFile(path, contents);
  return true;
}
