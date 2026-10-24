import { useRef } from 'react';

export function useUndoHistory<T>() {
  const entries = useRef<T[]>([]);
  return {
    get canUndo() { return entries.current.length > 0; },
    push: (entry: T) => { entries.current.push(entry); },
    pop: () => entries.current.pop(),
    clear: () => { entries.current = []; }
  };
}
