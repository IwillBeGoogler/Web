import type { DiagramNode, EdgeData, EdgeKind, ReplMode } from '../types';
import { ancestorsOf, isContainer } from '../lib/graph';
import { isPrimaryRole, isReplicaRole } from './roles';

export const EDGE_KINDS: EdgeKind[] = ['replication', 'heartbeat', 'failover', 'sharding'];
export const REPL_MODES: ReplMode[] = ['sync', 'async', 'semi-sync'];

export { EDGE_KIND_STYLE } from './edgeKindStyle';

const clusterOf = (nodes: DiagramNode[], id: string): string | undefined => ancestorsOf(nodes, id).find((a) => a.type === 'cluster')?.id;

/** Both ends inside the same cluster: primary -> replica = replication, peers = heartbeat. */
export function suggestEdgeKind(nodes: DiagramNode[], sourceId: string, targetId: string): Pick<EdgeData, 'kind' | 'replMode'> | null {
  const a = nodes.find((n) => n.id === sourceId);
  const b = nodes.find((n) => n.id === targetId);
  if (!a || !b || isContainer(a) || isContainer(b)) return null;
  const ca = clusterOf(nodes, a.id);
  if (!ca || ca !== clusterOf(nodes, b.id)) return null;
  if (isPrimaryRole(a.data.role) && isReplicaRole(b.data.role)) return { kind: 'replication', replMode: 'async' };
  return { kind: 'heartbeat' };
}
