import type en from './locales/en.json';

export type DestinationKind = 'backup' | 'output';
type Key = keyof typeof en;

export type StorageField = readonly [
  kind: DestinationKind,
  label: Key,
  tag: Key,
  desc: Key
];

export type StorageSelector = {
  id: 'copies' | 'count' | 'rename' | 'signature' | 'translation' | 'word';
  label: Key;
  note: Key;
  badge?: Key;
  // Only fields backed by a persisted setting are editable (spec §6).
  fields: readonly StorageField[];
};

export const storageSelectors: readonly StorageSelector[] = [
  { id: 'copies', label: 'copies', note: 'storageNoteCopies', badge: 'storageRulesBadge', fields: [] },
  { id: 'count', label: 'countNumber', note: 'storageNoteCount', fields: [] },
  {
    id: 'rename',
    label: 'renamePdfs',
    note: 'storageNoteRename',
    fields: [
      ['backup', 'backupFolder', 'storageBackupTag', 'storageBackupDesc'],
      ['output', 'outputFolder', 'storageOutputTag', 'storageOutputDesc'],
    ],
  },
  { id: 'signature', label: 'signatureAuthentication', note: 'storageNoteSignature', fields: [] },
  { id: 'translation', label: 'translation', note: 'storageNoteTranslation', fields: [] },
  { id: 'word', label: 'wordTemplates', note: 'wordFolders', fields: [] },
];

export const checkMessageKey: Record<string, Key> = {
  available: 'storageCheckAvailable',
  notFound: 'storageCheckNotFound',
  noWrite: 'storageCheckNoWrite',
  invalid: 'storageCheckInvalid',
  failed: 'storageCheckFailed',
};
