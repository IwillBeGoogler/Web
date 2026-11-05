import type { EdgeData } from '../types';

export interface EdgePreset {
  id: string;
  name: string;
  color: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  /** label colour follows the line unless set */
  labelColor?: string;
  labelBold?: boolean;
  builtin?: boolean;
}

export const BUILTIN_EDGE_PRESETS: EdgePreset[] = [
  { id: 'metrics', name: 'Metrics', color: '#d9480f', labelBold: true, builtin: true },
  { id: 'logs', name: 'Logs', color: '#1971c2', labelBold: true, builtin: true },
  { id: 'traces', name: 'Traces / OTLP', color: '#0c8599', labelBold: true, builtin: true },
  { id: 'control', name: 'Control', color: '#2d3340', strokeWidth: 2, builtin: true },
  { id: 'backup', name: 'Backup', color: '#6b7280', strokeStyle: 'dashed', builtin: true },
];

/** builtin presets, with user-defined ones appended (a user preset with a builtin id overrides it). */
export function allEdgePresets(user: EdgePreset[] = []): EdgePreset[] {
  const byId = new Map(BUILTIN_EDGE_PRESETS.map((p) => [p.id, p]));
  for (const u of user) byId.set(u.id, { ...u, builtin: false });
  return [...byId.values()];
}

export const findPreset = (id: string | undefined, user: EdgePreset[] = []): EdgePreset | undefined => (id ? allEdgePresets(user).find((p) => p.id === id) : undefined);

export function presetPatch(p: EdgePreset): Partial<EdgeData> {
  return {
    preset: p.id,
    color: p.color,
    strokeWidth: p.strokeWidth,
    strokeStyle: p.strokeStyle ?? 'solid',
    labelColor: p.labelColor ?? p.color,
    labelBold: p.labelBold ?? false,
  };
}

export function isPreset(x: unknown): x is EdgePreset {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0 && typeof o.name === 'string' && typeof o.color === 'string' && (o.strokeWidth === undefined || typeof o.strokeWidth === 'number');
}
