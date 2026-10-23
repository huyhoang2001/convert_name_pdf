export const fields: string[];
export const headers: { EN: string[]; VI: string[] };
export function fromRows(rows: unknown[][]): Record<string, string>[];
export function validate(records: unknown[]): unknown[];
export function loadSheets(data: unknown): {id:string;name:string;rows:Record<string,string>[]}[];
