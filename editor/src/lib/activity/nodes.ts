import type { DiagramNode } from '../../types';
import { withActivitySize } from './sizes';
import { ACTIVITY_ACCENT, ACTIVITY_DEFAULT_NAME, type ActivityData, type ActivityKind, type LaneOrient } from './types';

export const isActivityNode = (n: DiagramNode | undefined): boolean => n?.type === 'activity';
export const isLaneNode = (n: DiagramNode | undefined): boolean => n?.type === 'group' && n.data.variant === 'lane';
export const isActivityLike = (n: DiagramNode | undefined): boolean => isActivityNode(n) || isLaneNode(n);

export const activityNode = (id: string, position: { x: number; y: number }, actKind: ActivityKind = 'action', label?: string, extra: Partial<ActivityData> = {}): DiagramNode =>
  withActivitySize({ id, type: 'activity', position, data: { label: label ?? ACTIVITY_DEFAULT_NAME[actKind], actKind, accent: ACTIVITY_ACCENT, ...extra } as unknown as DiagramNode['data'] } as DiagramNode);

/** a swimlane / partition: a titled container, a column (`v`) or a row (`h`) */
export const laneNode = (id: string, position: { x: number; y: number }, label = 'Lane', w = 240, h = 520, orient: LaneOrient = 'v'): DiagramNode => ({
  id, type: 'group', position, width: w, height: h, style: { width: w, height: h },
  data: { label, variant: 'lane', laneOrient: orient, accent: ACTIVITY_ACCENT, stroke: ACTIVITY_ACCENT, fillOpacity: 3, border: true },
} as unknown as DiagramNode);
