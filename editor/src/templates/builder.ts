import type { Diagram, DiagramEdge, DiagramNode, PortSide } from '../types';
import { styleEdge } from '../lib/graph';
import { findPreset, presetPatch } from '../lib/edgePresets';
import { PROVIDERS } from '../data/cloud';

/** find a generated provider definition by (case-insensitive) label; throws so a renamed icon fails loudly in tests */
export function cloudDef(provider: string, label: string, kind: 'icon' | 'group' = 'icon') {
  const p = PROVIDERS.find((x) => x.SECTION.id === provider);
  const d = p?.DEFS.find((x) => x.kind === kind && x.label.toLowerCase() === label.toLowerCase());
  if (!d) throw new Error(`template: no ${provider} ${kind} "${label}" (rebuild the icon packs?)`);
  return d;
}

export interface LinkOpts {
  label?: string;
  preset?: string;
  pins?: [PortSide, PortSide];
  dashed?: boolean;
  color?: string;
  /** where along the line the label sits (0..1, default 0.5) */
  labelT?: number;
}

/** tiny DSL shared by the cloud / devops templates */
export function builder() {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  let seq = 0;
  const api = {
    nodes,
    edges,
    icon(id: string, label: string, iconId: string, x: number, y: number, parentId?: string, extra: Partial<DiagramNode['data']> = {}) {
      nodes.push({ id, type: 'icon', position: { x, y }, ...(parentId ? { parentId } : {}), data: { label, iconId, ...extra } });
      return id;
    },
    /** a group styled like the provider's official group (colour, dashed outline, icon) */
    group(id: string, def: ReturnType<typeof cloudDef>, x: number, y: number, w: number, h: number, parentId?: string, label?: string) {
      const preset = def.preset!;
      nodes.push({ id, type: 'group', position: { x, y }, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}), data: { ...(preset.data as Record<string, unknown>), label: label ?? def.label, groupIcon: def.iconId } as DiagramNode['data'] });
      return id;
    },
    plainGroup(id: string, label: string, x: number, y: number, w: number, h: number, data: Partial<DiagramNode['data']> = {}, parentId?: string) {
      nodes.push({ id, type: 'group', position: { x, y }, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}), data: { label, ...data } });
      return id;
    },
    text(id: string, label: string, x: number, y: number, w: number, h: number, data: Partial<DiagramNode['data']> = {}) {
      nodes.push({ id, type: 'text', position: { x, y }, width: w, height: h, data: { label, ...data } });
    },
    link(source: string, target: string, o: LinkOpts = {}) {
      const p = o.preset ? findPreset(o.preset) : undefined;
      edges.push(
        styleEdge({
          id: `e${++seq}`, source, target, ...(o.label ? { label: o.label } : {}),
          data: { ...(p ? presetPatch(p) : {}), ...(o.pins ? { pinSource: o.pins[0], pinTarget: o.pins[1] } : {}), ...(o.dashed ? { strokeStyle: 'dashed', dashed: true } : {}), ...(o.color ? { color: o.color } : {}), ...(o.labelT !== undefined ? { labelT: o.labelT } : {}) },
        }),
      );
    },
    done(): Diagram {
      return { version: 1, nodes, edges };
    },
  };
  return api;
}
