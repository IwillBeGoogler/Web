export interface AccordionState {
  open: string[];
  multi: boolean;
}
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

/** Everything starts collapsed; opening one closes the others (single-open). */
export const initialAccordion = (_ids?: readonly string[]): AccordionState => ({ open: [], multi: false });

export function toggleSection(s: AccordionState, id: string): AccordionState {
  const isOpen = s.open.includes(id);
  if (s.multi) return { ...s, open: isOpen ? s.open.filter((x) => x !== id) : [...s.open, id] };
  return { ...s, open: isOpen ? [] : [id] };
}

export function setMulti(s: AccordionState, multi: boolean): AccordionState {
  return { multi, open: multi ? s.open : s.open.slice(0, 1) };
}

export const expandAll = (_s: AccordionState, ids: readonly string[]): AccordionState => ({ open: [...ids], multi: true });
export const collapseAll = (s: AccordionState): AccordionState => ({ ...s, open: [] });

/** While searching (matching != null) show exactly the matching sections; else stored state. */
export function effectiveOpen(s: AccordionState, matching: string[] | null): string[] {
  return matching ? matching : s.open;
}

export function loadAccordion(st: Reader, key: string, ids: readonly string[], fallback?: AccordionState): AccordionState {
  try {
    const v = JSON.parse(st.getItem(key) ?? 'null');
    if (v && Array.isArray(v.open) && typeof v.multi === 'boolean') {
      const open = v.open.filter((x: unknown): x is string => typeof x === 'string' && ids.includes(x));
      return { multi: v.multi, open: v.multi ? open : open.slice(0, 1) };
    }
  } catch {
    /* fall through */
  }
  return fallback ?? initialAccordion(ids);
}

export function saveAccordion(st: Writer, key: string, s: AccordionState): void {
  try {
    st.setItem(key, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
