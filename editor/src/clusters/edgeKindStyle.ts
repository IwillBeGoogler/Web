import type { EdgeKind } from '../types';

/** Default styling per cluster-internal edge kind (explicit edge values still win). Leaf module: no imports from lib/. */
export const EDGE_KIND_STYLE: Record<EdgeKind, Partial<{ strokeStyle: 'solid' | 'dashed' | 'dotted'; arrows: 'none' | 'end'; lineType: 'curved'; color: string; width: number }>> = {
  replication: { strokeStyle: 'dashed', arrows: 'end' },
  heartbeat: { strokeStyle: 'dotted', arrows: 'none' },
  failover: { strokeStyle: 'dashed', arrows: 'end', lineType: 'curved', color: '#e5484d' },
  sharding: { strokeStyle: 'solid', arrows: 'none', width: 1 },
};
