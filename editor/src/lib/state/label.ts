export interface TransitionLabel {
  event: string;
  guard: string;
  action: string;
}
/** `event [guard] / action`, every part optional */
export function parseTransition(label: string): TransitionLabel {
  let rest = (label ?? '').trim();
  let action = '';
  const slash = rest.indexOf('/');
  if (slash >= 0) {
    action = rest.slice(slash + 1).trim();
    rest = rest.slice(0, slash).trim();
  }
  let guard = '';
  const g = rest.match(/\[([^\]]*)\]/);
  if (g) {
    guard = g[1].trim();
    rest = (rest.slice(0, g.index) + rest.slice((g.index ?? 0) + g[0].length)).trim();
  }
  return { event: rest.replace(/\s+/g, ' '), guard, action };
}
export function formatTransition(t: Partial<TransitionLabel>): string {
  const parts: string[] = [];
  if (t.event?.trim()) parts.push(t.event.trim());
  if (t.guard?.trim()) parts.push(`[${t.guard.trim()}]`);
  const head = parts.join(' ');
  if (t.action?.trim()) return head ? `${head} / ${t.action.trim()}` : `/ ${t.action.trim()}`;
  return head;
}
