import type { DiagramNode } from '../../types';
import { withTableSize } from '../er/geometry';
import { withClassSize } from '../uml/geometry';
import { withStateSize } from '../state/convert';
import { withShapeSize } from '../uml2/sizes';
import { withSequenceSize } from '../seq/node';
import { withTimingSize } from '../timing/node';
import { withActivitySize } from '../activity/sizes';
import { withDeploymentSize } from '../deployment/sizes';
import { withObjectSize } from '../object/sizes';

/** nodes built from text get the exact client-side sizes (tables, sequences) and the React Flow style size (groups) */
export function finalizeNode(n: DiagramNode): DiagramNode {
  if (n.type === 'table') return withTableSize(n);
  if (n.type === 'class') return withClassSize(n);
  if (n.type === 'state') return withStateSize(n);
  if (n.type === 'usecase' || n.type === 'component') return withShapeSize(n);
  if (n.type === 'sequence') return withSequenceSize(n);
  if (n.type === 'timing') return withTimingSize(n);
  if (n.type === 'activity') return withActivitySize(n);
  if (n.type === 'deployment') return withDeploymentSize(n);
  if (n.type === 'object') return withObjectSize(n);
  if (n.width && n.height && n.type === 'group') return { ...n, style: { ...(n.style ?? {}), width: n.width, height: n.height } };
  return n;
}
