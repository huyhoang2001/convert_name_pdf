export function parseReleaseVersion(value: string): { baseVersion: string; revision: number; displayVersion: string };
export function compareReleaseVersions(left: string, right: string): number;
export function nextReleaseRevision(baseVersion: string, occupied?: string[]): string;
