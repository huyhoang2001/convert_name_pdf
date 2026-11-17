import type { Row } from 'exceljs';

export function normalizeSignaturePerson(value: string): string;
export function uppercaseSignatureText(value: string): string;
export function signatureDocumentSuggestions(rows: { document: string }[], query: string): string[];
export function splitSearchMatches(value: string, query: string): { text: string; match: boolean }[];
export function duplicateSignatureNumbers(rows: { number: string }[]): Set<number>;
export function formatSignatureNumber(value: string | number): string;
export function nextAvailableSignatureNumber(rows: { number: string }[]): string;
export function nextSignatureNumberAfterHighWater(rows: { number: string }[], highWater?: number): string;
export function insertSignatureRow<T extends { number: string }>(rows: T[], row: T): T[];
export function applySignatureDuplicateFill(row: Row): void;
