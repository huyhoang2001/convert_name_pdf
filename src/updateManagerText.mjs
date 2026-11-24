import { parseReleaseVersion } from '../scripts/release-version.mjs';

export function formatComponentVersion(component, version, releaseId) {
  if (!version || !releaseId?.startsWith(`${component}-v`)) return version;
  try { return parseReleaseVersion(releaseId.slice(component.length + 2)).displayVersion; }
  catch { return version; }
}

export function formatUpdateTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
