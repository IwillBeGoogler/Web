import type { EdgeData } from '../../types';
import type { EdgePreset } from '../edgePresets';
import { findPreset } from '../edgePresets';
import { DEFAULT_DENSITY, type FlowDir, type FlowSpeed, type FlowStyle } from './geometry';

export interface FlowLook { speed: FlowSpeed; density: number; style: FlowStyle }

/** preset-level defaults: metrics = fast orange dots, logs = blue dashes, traces = teal pulses */
export const PRESET_FLOW: Record<string, FlowLook> = {
  metrics: { speed: 'fast', density: 1.6, style: 'dot' },
  logs: { speed: 'normal', density: 1.2, style: 'dash' },
  traces: { speed: 'normal', density: 1.0, style: 'pulse' },
  control: { speed: 'slow', density: 0.8, style: 'dot' },
  backup: { speed: 'slow', density: 0.6, style: 'dash' },
};
export const BASE_FLOW: FlowLook = { speed: 'normal', density: DEFAULT_DENSITY, style: 'dot' };

type PresetWithFlow = EdgePreset & Partial<FlowLook>;

/** edge data > its preset (builtin or user) > base defaults */
export function resolveFlowLook(data: Partial<EdgeData> | undefined, userPresets: EdgePreset[] = []): FlowLook {
  const id = data?.preset;
  const preset = findPreset(id, userPresets) as PresetWithFlow | undefined;
  const fromPreset: Partial<FlowLook> = id ? { ...(PRESET_FLOW[id] ?? {}), ...(preset && !preset.builtin ? pickLook(preset) : {}) } : {};
  const density = typeof data?.flowDensity === 'number' && data.flowDensity > 0 ? data.flowDensity : fromPreset.density ?? BASE_FLOW.density;
  return { speed: data?.flowSpeed ?? fromPreset.speed ?? BASE_FLOW.speed, density: Math.min(8, Math.max(0.2, density)), style: data?.flowStyle ?? fromPreset.style ?? BASE_FLOW.style };
}
const pickLook = (p: PresetWithFlow): Partial<FlowLook> => ({ ...(p.speed ? { speed: p.speed } : {}), ...(p.style ? { style: p.style } : {}), ...(p.density ? { density: p.density } : {}) });

/** is this edge animated? per-edge override first, then the page-wide "Data flow" mode */
export const edgeFlows = (data: Partial<EdgeData> | undefined, pageFlow: boolean): boolean => (data?.dataFlow === true ? true : data?.dataFlow === false ? false : pageFlow);

/** which ways packets travel: explicit flowDir, else follows the arrowheads; no arrowheads and no explicit direction = no packets */
export function resolveFlowDir(data: Partial<EdgeData> | undefined, arrows: 'none' | 'start' | 'end' | 'both'): FlowDir | null {
  if (data?.flowDir) return data.flowDir;
  return arrows === 'end' ? 'forward' : arrows === 'start' ? 'reverse' : arrows === 'both' ? 'both' : null;
}
