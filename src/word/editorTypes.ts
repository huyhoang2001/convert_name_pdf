import type { WordPayload } from './bridge';

export type Tab = { id: string; name: string; bytes: Uint8Array; path?: string; sourceFile?: string; hash?: string; source: WordPayload['source'] | 'blank'; templateName: string; day: string; month: string; dirty: boolean; saving: boolean; error: string; readonlyReason: string; failureKind?: 'startup' | 'import' | 'compatibility'; revision: number };
export type EditorAccess = { save: () => Promise<string>; print: () => Promise<void>; snapshotRevision?: () => string; confirmSaved?: (name: string, revision: string) => void };
