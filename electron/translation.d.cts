export const fields: string[];
export const headers: { EN: string[]; VI: string[] };
export function fromRows(rows: unknown[][]): Record<string, string>[];
export function validate(records: unknown[]): unknown[];
