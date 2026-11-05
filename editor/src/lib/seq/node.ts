import type { DiagramNode } from '../../types';
import { layoutSequence } from './layout';
import type { SequenceData, SequenceModel } from './types';

export const SEQ_ACCENT = '#2f6fdb';
export const sequenceOf = (n: DiagramNode): SequenceData => n.data as unknown as SequenceData;
export const isSequenceNode = (n: DiagramNode | undefined): n is DiagramNode & { data: SequenceData } => n?.type === 'sequence';

export function sequenceSize(d: SequenceModel): { width: number; height: number } {
  const l = layoutSequence(d);
  return { width: l.width, height: l.height };
}
/** the node owns its layout: width and height always follow the content */
export function withSequenceSize(n: DiagramNode): DiagramNode {
  const { width, height } = sequenceSize(sequenceOf(n));
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}
export function sequenceNode(id: string, position: { x: number; y: number }, model: SequenceModel, label = 'Sequence'): DiagramNode {
  const data: SequenceData = { ...model, label, accent: SEQ_ACCENT };
  return withSequenceSize({ id, type: 'sequence', position, data: data as unknown as DiagramNode['data'] } as DiagramNode);
}
/** starter diagram for a freshly dropped frame: two participants and a call with its return */
export function blankSequence(id: string, position: { x: number; y: number }, label = 'Sequence'): DiagramNode {
  return sequenceNode(id, position, {
    autonumber: false,
    participants: [{ id: 'p1', name: 'Client', kind: 'actor' }, { id: 'p2', name: 'Server', kind: 'participant' }],
    items: [
      { type: 'message', id: 'm1', from: 'p1', to: 'p2', text: 'request', kind: 'sync' },
      { type: 'message', id: 'm2', from: 'p2', to: 'p1', text: 'response', kind: 'return' },
    ],
  }, label);
}
