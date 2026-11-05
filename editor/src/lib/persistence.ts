import type { Diagram } from '../types';
import { parseDiagram, serializeDiagram } from './serialization';

export const STORAGE_KEY = 'system-design-diagram:v1';

export function saveToStorage(storage: Pick<Storage, 'setItem'>, d: Diagram): void {
  try {
    storage.setItem(STORAGE_KEY, serializeDiagram(d));
  } catch {
    /* quota / private mode: ignore */
  }
}

export function loadFromStorage(storage: Pick<Storage, 'getItem'>): Diagram | null {
  try {
    const t = storage.getItem(STORAGE_KEY);
    if (!t) return null;
    const r = parseDiagram(t);
    return r.ok ? r.diagram : null;
  } catch {
    return null;
  }
}
