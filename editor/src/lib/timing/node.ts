import type { Diagram, DiagramNode } from '../../types';
import { timingSize } from './layout';
import { TIMING_ACCENT, type TimingData, type TimingModel } from './types';

export const timingOf = (n: DiagramNode): TimingData => n.data as unknown as TimingData;
export const isTimingNode = (n: DiagramNode | undefined): n is DiagramNode & { data: TimingData } => n?.type === 'timing';

/** the node owns its layout: width and height always follow the content */
export function withTimingSize(n: DiagramNode): DiagramNode {
  const { width, height } = timingSize(timingOf(n));
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}
export function timingNode(id: string, position: { x: number; y: number }, model: TimingModel, label = 'Timing'): DiagramNode {
  const data: TimingData = { ...model, label, accent: TIMING_ACCENT };
  return withTimingSize({ id, type: 'timing', position, data: data as unknown as DiagramNode['data'] } as DiagramNode);
}
/** starter frame: a robust "Web" lifeline and a concise "User" lifeline with a few changes and a message */
export function blankTiming(id: string, position: { x: number; y: number }, label = 'Timing'): DiagramNode {
  return timingNode(id, position, {
    end: 400, unit: 'ms',
    lifelines: [
      { id: 'l1', name: 'User', kind: 'concise', states: ['Idle', 'Waiting'] },
      { id: 'l2', name: 'Server', kind: 'robust', states: ['Idle', 'Busy'] },
    ],
    changes: [
      { id: 'c1', life: 'l1', t: 0, state: 'Idle' }, { id: 'c2', life: 'l1', t: 100, state: 'Waiting' }, { id: 'c3', life: 'l1', t: 300, state: 'Idle' },
      { id: 'c4', life: 'l2', t: 0, state: 'Idle' }, { id: 'c5', life: 'l2', t: 150, state: 'Busy' }, { id: 'c6', life: 'l2', t: 250, state: 'Idle' },
    ],
    messages: [{ id: 'm1', from: 'l1', to: 'l2', t: 100, t2: 150, text: 'request' }],
    durations: [{ id: 'k1', life: 'l2', t1: 150, t2: 250, text: '{100 ms}' }],
  }, label);
}
/** a bare frame with one lifeline of each kind a user can add */
export function timingModelToDiagram(model: TimingModel, name = 'Timing', origin = { x: 0, y: 0 }): Diagram {
  return { version: 1, nodes: [timingNode('tm1', origin, model, name)], edges: [] };
}
