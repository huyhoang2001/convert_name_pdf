const stable = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)';
const pattern = new RegExp(`^v?${stable}(?:\\.(\\d{4,}))?$`);

export function parseReleaseVersion(value) {
  const match = pattern.exec(value);
  if (!match) throw Error(`Invalid B6H release version: ${value}`);
  const parts = match.slice(1, 4).map(Number);
  const revision = match[4] === undefined ? 0 : Number(match[4]);
  if (![...parts, revision].every(Number.isSafeInteger) || revision > 9999 ||
      match[4] !== undefined && (revision === 0 || match[4] !== String(revision).padStart(4, '0'))) {
    throw Error(`Invalid B6H release version: ${value}`);
  }
  const baseVersion = parts.join('.');
  return { baseVersion, revision, displayVersion: revision ? `${baseVersion}.${String(revision).padStart(4, '0')}` : baseVersion };
}

export function compareReleaseVersions(left, right) {
  const a = parseReleaseVersion(left);
  const b = parseReleaseVersion(right);
  const valuesA = [...a.baseVersion.split('.').map(Number), a.revision];
  const valuesB = [...b.baseVersion.split('.').map(Number), b.revision];
  for (let i = 0; i < valuesA.length; i++) {
    if (valuesA[i] !== valuesB[i]) return Math.sign(valuesA[i] - valuesB[i]);
  }
  return 0;
}

export function nextReleaseRevision(baseVersion, occupied = []) {
  const base = parseReleaseVersion(baseVersion);
  if (base.revision !== 0) throw Error('Expected a three-part base version.');
  const revisions = occupied.map(value => parseReleaseVersion(value))
    .filter(value => value.baseVersion === base.baseVersion).map(value => value.revision);
  const next = Math.max(0, ...revisions) + 1;
  if (!Number.isSafeInteger(next) || next > 9999) throw Error('B6H release revision overflow.');
  return `${base.baseVersion}.${String(next).padStart(4, '0')}`;
}
