export const MAX_WORDCRAFT_DOCX_BYTES = 30 * 1024 * 1024;

export type WordcraftStage = 'wasm-starting' | 'html-loaded' | 'renderer-ready' | 'document-opening' | 'snapshot-checking' | 'usable' | 'import-failed';

export function advanceWordcraftStage(stage: WordcraftStage, event: 'html-loaded' | 'ready' | 'open-sent' | 'opened' | 'checked'): WordcraftStage | null {
  if (event === 'html-loaded' && stage === 'wasm-starting') return 'html-loaded';
  if (event === 'ready' && (stage === 'wasm-starting' || stage === 'html-loaded')) return 'renderer-ready';
  if (event === 'open-sent' && stage === 'renderer-ready') return 'document-opening';
  if (event === 'opened' && stage === 'document-opening') return 'snapshot-checking';
  if (event === 'checked' && stage === 'snapshot-checking') return 'usable';
  return null;
}

export function wordcraftTimeoutKind(stage: WordcraftStage): 'startup' | 'import' {
  return stage === 'wasm-starting' || stage === 'html-loaded' ? 'startup' : 'import';
}

export function wordcraftMessage(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, frame: Window | null, origin: string): Record<string, unknown> | null {
  if (!frame || event.source !== frame || event.origin !== origin || !event.data || typeof event.data !== 'object') return null;
  return event.data as Record<string, unknown>;
}

export function wordcraftBytes(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer && value.byteLength <= MAX_WORDCRAFT_DOCX_BYTES;
}
