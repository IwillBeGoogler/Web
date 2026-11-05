import type { VersionMeta } from '../api/types';
import type { DiagramEdge, DiagramNode, Project } from '../types';
import { normalizeLocks, sortParentsFirst, styleEdge } from './graph';
import { describeChange, diffProjects, diffSummary, type DocDiff } from './versionDiff';

/** Pure helpers of the version timeline (the bar at the bottom of the canvas). No React, no network. */

/** versions oldest first (the timeline reads left to right); never mutates the input */
export const sortAscending = (items: readonly VersionMeta[]): VersionMeta[] => [...items].sort((a, b) => a.version - b.version);

/**
 * The slot "live" (the document as it is in the editor) comes after the last version. Selection = index into versions,
 * `null` = live. These helpers move it with the arrow keys and the play button.
 */
export function stepSelection(selected: number | null, dir: -1 | 1, count: number): number | null {
  if (count === 0) return null;
  if (selected === null) return dir < 0 ? count - 1 : null; // ← from live goes to the newest version, → stays on live
  const next = selected + dir;
  if (next < 0) return 0;
  return next >= count ? null : next;
}

/** next index while playing; `null` = the end was reached (play stops on the newest version, it does not wrap) */
export function playNext(selected: number | null, count: number): number | null {
  if (count === 0) return null;
  const from = selected === null ? -1 : selected; // play from live starts at the oldest version
  return from + 1 < count ? from + 1 : null;
}

/** where a play press begins: the oldest version when nothing is selected or the newest is already shown */
export const playStart = (selected: number | null, count: number): number | null => (selected === null || selected >= count - 1 ? (count ? 0 : null) : selected);

/** a person's name, or a graceful stand-in: old / imported / automatic versions have no author ("0", empty) */
export function authorLabel(createdBy: string | null | undefined, names: Record<string, string> = {}): string | null {
  const id = (createdBy ?? '').trim();
  if (!id || id === '0') return null;
  return names[id] ?? null;
}

export interface DayGroup { key: string; label: Date; from: number; count: number }
const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
/** consecutive versions saved on the same day, so a long history reads as "Mon 3 Nov (12)" headings above its points */
export function groupByDay(items: readonly VersionMeta[]): DayGroup[] {
  const out: DayGroup[] = [];
  items.forEach((v, i) => {
    const key = dayKey(v.createdAt);
    const last = out[out.length - 1];
    if (last?.key === key) last.count += 1;
    else out.push({ key, label: new Date(v.createdAt), from: i, count: 1 });
  });
  return out;
}

/** the page of a version that is drawn: the one that is open now, else the first */
export function pageOf(doc: Project, activePageId: string): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
  return {
    nodes: sortParentsFirst(normalizeLocks((page?.nodes ?? []).map((n) => ({ ...n, selected: false, dragging: false })))),
    edges: (page?.edges ?? []).map((e) => styleEdge({ ...e, selected: false })),
  };
}

export interface ChangeNote { diff: DocDiff | null; summary: string; details: string[] }
/** what one version changed against the one before it (the first version has nothing to compare with) */
export function changeNote(prev: Project | null, doc: Project, labelOf: (r: { id: string; data?: unknown }) => string = defaultLabel): ChangeNote {
  if (!prev) return { diff: null, summary: 'First version', details: [] };
  const diff = diffProjects(prev, doc);
  const details = [
    ...(diff.nameChanged ? [`Renamed “${diff.nameChanged.from}” → “${diff.nameChanged.to}”`] : []),
    ...diff.nodes.added.map((n) => `+ ${labelOf(n)}`),
    ...diff.nodes.removed.map((n) => `− ${labelOf(n)}`),
    ...diff.nodes.changed.map((c) => `~ ${labelOf(c.after)}: ${describeChange(c)}`),
    ...diff.edges.changed.map((c) => `~ connection ${c.id}: ${describeChange(c)}`),
  ];
  return { diff, summary: diffSummary(diff), details };
}
const defaultLabel = (n: { id: string; data?: unknown }): string => String((n.data as { label?: unknown } | undefined)?.label || n.id);
