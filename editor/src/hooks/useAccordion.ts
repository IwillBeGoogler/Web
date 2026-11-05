import { useCallback, useEffect, useState } from 'react';
import { collapseAll, expandAll, loadAccordion, saveAccordion, setMulti, toggleSection, type AccordionState } from '../lib/accordion';

export function useAccordion(storageKey: string, ids: readonly string[], fallback?: AccordionState) {
  const [state, setState] = useState<AccordionState>(() => {
    try {
      return loadAccordion(localStorage, storageKey, ids, fallback);
    } catch {
      return fallback ?? { open: [], multi: false };
    }
  });
  useEffect(() => {
    try {
      saveAccordion(localStorage, storageKey, state);
    } catch {
      /* ignore */
    }
  }, [storageKey, state]);
  return {
    state,
    toggle: useCallback((id: string) => setState((s) => toggleSection(s, id)), []),
    setMulti: useCallback((m: boolean) => setState((s) => setMulti(s, m)), []),
    expandAll: useCallback(() => setState((s) => expandAll(s, ids)), [ids]),
    collapseAll: useCallback(() => setState((s) => collapseAll(s)), []),
  };
}
