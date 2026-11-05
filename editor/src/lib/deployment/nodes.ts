import type { DiagramNode } from '../../types';
import { withDeploymentSize } from './sizes';
import { DEPLOYMENT_ACCENT, DEPLOYMENT_DEFAULT_NAME, type DeploymentData, type DeploymentKind } from './types';

export const isDeploymentNode = (n: DiagramNode | undefined): boolean => n?.type === 'deployment';

export const deploymentNode = (id: string, position: { x: number; y: number }, depKind: DeploymentKind = 'node', label?: string, extra: Partial<DeploymentData> = {}): DiagramNode =>
  withDeploymentSize({ id, type: 'deployment', position, data: { label: label ?? DEPLOYMENT_DEFAULT_NAME[depKind], depKind, accent: DEPLOYMENT_ACCENT, ...extra } as unknown as DiagramNode['data'] } as DiagramNode);
