import type { DiagramNode } from '../../types';
import type { DeploymentData } from './types';

const snap = (n: number) => Math.round(n / 10) * 10;

/** size of a deployment element from its data (mirrors core/dsl/build2.ts depSizeOf) */
export function deploymentSize(d: Record<string, unknown>): { width: number; height: number } {
  const a = d as unknown as DeploymentData;
  const len = String(a.label ?? '').length;
  switch (a.depKind) {
    case 'device': return { width: Math.max(160, snap(len * 7.6 + 70)), height: 110 };
    case 'executionEnvironment': return { width: Math.max(150, snap(len * 7.6 + 60)), height: 80 };
    case 'artifact': return { width: Math.max(130, snap(len * 7.6 + 50)), height: 72 };
    case 'component': return { width: Math.max(150, snap(len * 7.6 + 70)), height: 72 };
    default: return { width: Math.max(160, snap(len * 7.6 + 70)), height: 96 };
  }
}
/** a container keeps the size the layout / the user gave it */
export function withDeploymentSize(n: DiagramNode): DiagramNode {
  if ((n.data as unknown as DeploymentData).container && n.width && n.height) return n;
  const { width, height } = deploymentSize(n.data);
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}
