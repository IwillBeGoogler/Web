import type { DiagramNode } from '../types';
import { descendantsOf, isContainer } from '../lib/graph';

export const ROLES = ['primary', 'replica', 'standby', 'leader', 'follower', 'arbiter', 'master', 'slave', 'shard', 'coordinator', 'data', 'ingest', 'controller', 'broker', 'sentinel', 'witness'] as const;
export type Role = (typeof ROLES)[number];

export type RoleKind = 'accent' | 'muted' | 'outline';
const ACCENT = new Set(['primary', 'leader', 'master', 'controller']);
const OUTLINE = new Set(['arbiter', 'sentinel', 'witness']);
export const roleKind = (role: string): RoleKind => (ACCENT.has(role) ? 'accent' : OUTLINE.has(role) ? 'outline' : 'muted');
export const isPrimaryRole = (role?: string): boolean => !!role && ['primary', 'leader', 'master'].includes(role);
export const isReplicaRole = (role?: string): boolean => !!role && ['replica', 'follower', 'slave', 'standby'].includes(role);

export function validateRole(input: string): { ok: true; role: string } | { ok: false; error: string } {
  const role = input.trim();
  if (!role) return { ok: false, error: 'Role cannot be empty' };
  if (role.length > 24) return { ok: false, error: 'Role must be 24 characters or fewer' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(role)) return { ok: false, error: 'Role cannot contain control characters' };
  return { ok: true, role };
}

const PLURAL: Record<string, string> = { replica: 'replicas', follower: 'followers', slave: 'slaves', standby: 'standbys', shard: 'shards', broker: 'brokers', controller: 'controllers', arbiter: 'arbiters', sentinel: 'sentinels', witness: 'witnesses', coordinator: 'coordinators' };
const pluralize = (role: string, n: number) => (n === 1 ? role : PLURAL[role] ?? `${role}s`);
const ORDER = ['primary', 'leader', 'master', 'controller', ...ROLES];

/** "1 primary · 2 replicas" for the leaf members of a cluster. */
export function roleSummary(nodes: DiagramNode[], clusterId: string): string {
  const counts = new Map<string, number>();
  for (const n of descendantsOf(nodes, clusterId)) if (!isContainer(n) && n.data.role) counts.set(n.data.role, (counts.get(n.data.role) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)));
  return keys.map((k) => `${counts.get(k)} ${pluralize(k, counts.get(k)!)}`).join(' · ');
}
