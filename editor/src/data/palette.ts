import { resolveId } from './idAliases';
import type { DiagramNode } from '../types';
import { blankJunction, blankTable } from '../lib/er/relations';
import { blankClass } from '../lib/uml/geometry';
import { blankSequence, sequenceNode } from '../lib/seq/node';
import { stateNode } from '../lib/state/convert';
import { activityNode } from '../lib/activity/nodes';
import type { ActivityKind } from '../lib/activity/types';
import { actorNode, componentNode, useCaseNode } from '../lib/uml2/nodes';
import { deploymentNode } from '../lib/deployment/nodes';
import { objectNode } from '../lib/object/nodes';
import { blankTiming, timingNode } from '../lib/timing/node';
import type { DeploymentKind } from '../lib/deployment/types';
import type { StateKind } from '../lib/state/types';
import type { ComponentKind } from '../lib/uml2/types';
import { useBoardStore } from '../store/boardStore';
import { createFrame } from '../lib/board/frames';
import { createRoot } from '../lib/board/mindmap';
import { ALL_ITEMS, ITEMS_BY_ID, searchItems, type CatalogItem } from './catalog';

export type PaletteItem = CatalogItem;
export const PALETTE: PaletteItem[] = ALL_ITEMS;
export const getItem = (id: string): PaletteItem | undefined => ITEMS_BY_ID.get(resolveId(id));

/** Flat search: label, id, aliases, keywords, section names. */
export function filterPalette(items: PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) return items;
  const ids = new Set(items.map((i) => i.id));
  return searchItems(query).filter((i) => ids.has(i.id));
}

const CLIENT_KINDS: Record<string, 'producer' | 'consumer'> = { producer: 'producer', consumer: 'consumer' };

/** Palette item -> nodes (a consumer group is a group node holding three consumer instances). */
export function createNodesFromPaletteItem(item: PaletteItem, position: { x: number; y: number }, genId: (p: string) => string): DiagramNode[] {
  if (item.id === 'consumer-group') {
    const gid = genId('g');
    return [
      { id: gid, type: 'group', position, width: 340, height: 170, style: { width: 340, height: 170 }, data: { label: 'group: orders-svc', clientKind: 'consumer', stroke: '#4b5563', strokeStyle: 'dashed' } },
      ...[0, 1, 2].map((i): DiagramNode => ({ id: genId('n'), type: 'icon', parentId: gid, position: { x: 14 + i * 108, y: 44 }, width: 100, height: 96, data: { label: `consumer-${i + 1}`, iconId: 'consumer', clientKind: 'consumer' } })),
    ];
  }
  return [createNodeFromPaletteItem(item, position, genId('n'))];
}

export function createNodeFromPaletteItem(item: PaletteItem, position: { x: number; y: number }, id: string): DiagramNode {
  const p = item.preset;
  switch (item.kind) {
    case 'group':
      return {
        id, type: 'group', position, width: p?.width ?? 320, height: p?.height ?? 220,
        style: { width: p?.width ?? 320, height: p?.height ?? 220 },
        data: { label: 'Group', ...(p?.data ?? {}) },
      };
    case 'cluster':
      return { id, type: 'cluster', position, width: p?.width ?? 420, height: p?.height ?? 260, style: { width: p?.width ?? 420, height: p?.height ?? 260 }, data: { label: 'Cluster', ...(item.iconId && item.profileId ? { iconId: item.iconId } : {}), ...(p?.data ?? {}) } };
    case 'text':
      return { id, type: 'text', position, ...(p ? { width: p.width, height: p.height } : {}), data: { label: 'Title', fontSize: 20, bold: true, ...(p?.data ?? {}) } };
    case 'card':
      return { id, type: 'card', position, width: p?.width ?? 200, height: p?.height ?? 120, style: { width: p?.width ?? 200, height: p?.height ?? 120 }, data: { label: 'Service', layout: 'vertical', tags: [], ...(p?.data ?? {}) } };
    case 'table':
      return item.id === 'er-junction' ? blankJunction(id, position) : blankTable(id, position, item.id === 'er-view' ? 'view_name' : item.id === 'er-enum' ? 'enum_name' : 'table_name', item.id === 'er-view' ? 'view' : item.id === 'er-enum' ? 'enum' : 'table');
    case 'class':
      return blankClass(id, position, item.id === 'uml-interface' ? 'interface' : item.id === 'uml-abstract' ? 'abstract' : item.id === 'uml-enum' ? 'enum' : 'class');
    case 'sequence':
      return item.id === 'uml-lifeline'
        ? sequenceNode(id, position, { autonumber: false, participants: [{ id: 'p1', name: 'Object', kind: 'participant' }], items: [] }, 'Lifeline')
        : blankSequence(id, position);
    case 'state': {
      const kinds: Record<string, StateKind> = { 'uml-initial': 'initial', 'uml-final': 'final', 'uml-choice': 'choice', 'uml-fork': 'fork', 'uml-join': 'join', 'uml-history': 'history', 'uml-deep-history': 'deepHistory', 'uml-entry-point': 'entryPoint', 'uml-exit-point': 'exitPoint' };
      const k = kinds[item.id] ?? 'state';
      return stateNode(id, position, { label: k === 'state' ? 'State' : '', stateKind: k });
    }
    case 'activity': {
      const kinds: Record<string, ActivityKind> = { 'uml-act-initial': 'initial', 'uml-act-final': 'final', 'uml-act-flow-final': 'flowFinal', 'uml-act-decision': 'decision', 'uml-act-fork': 'fork', 'uml-act-object': 'object', 'uml-act-send': 'send', 'uml-act-accept': 'accept', 'uml-act-note': 'note' };
      return activityNode(id, position, kinds[item.id] ?? 'action');
    }
    case 'usecase':
      return item.id === 'uml-actor' ? actorNode(id, position, 'Actor') : useCaseNode(id, position, 'Use case');
    case 'component': {
      const kinds: Record<string, ComponentKind> = { 'uml-node': 'node', 'uml-artifact': 'artifact', 'uml-provided': 'provided', 'uml-required': 'required' };
      return componentNode(id, position, kinds[item.id] ?? 'component');
    }
    case 'deployment': {
      const kinds: Record<string, DeploymentKind> = { 'uml-dep-device': 'device', 'uml-dep-env': 'executionEnvironment', 'uml-dep-artifact': 'artifact', 'uml-dep-component': 'component' };
      return deploymentNode(id, position, kinds[item.id] ?? 'node');
    }
    case 'object':
      return item.id === 'uml-comm-object' ? objectNode(id, position, 'obj') : objectNode(id, position);
    case 'timing':
      return item.id === 'uml-timing-lifeline'
        ? timingNode(id, position, { end: 100, unit: '', lifelines: [{ id: 'l1', name: 'Signal', kind: 'robust', states: [] }], changes: [], messages: [], durations: [] }, 'Timing')
        : blankTiming(id, position);
    case 'frame':
      return { ...createFrame(id, { x: position.x, y: position.y, width: p?.width ?? 800, height: p?.height ?? 500 }, 'Frame'), data: { label: 'Frame' } };
    case 'mindmap':
      return createRoot(id, position);
    case 'stamp':
      return { id, type: 'stamp', position, width: 56, height: 56, data: { label: '', emoji: (p?.data?.emoji as string | undefined) ?? useBoardStore.getState().stampEmoji } };
    case 'junction':
      return { id, type: 'junction', position, width: 10, height: 10, data: { label: '' } };
    case 'sticky':
      return {
        id, type: 'sticky', position, width: p?.width ?? 160, height: p?.height ?? 140,
        data: { label: 'Note', fill: '#fff3a3', stroke: '#e0c84a', strokeWidth: 1, fontSize: 13, ...(p?.data ?? {}) },
      };
    case 'shape':
      return {
        id, type: 'shape', position, width: p?.width ?? 140, height: p?.height ?? 90,
        data: { label: '', shape: item.shape ?? 'rect', ...(p?.data ?? {}) },
      };
    default:
      return {
        id, type: 'icon', position,
        data: { label: item.label, iconId: item.iconId, ...(item.subtitle ? { subtitle: item.subtitle } : {}), ...(CLIENT_KINDS[item.id] ? { clientKind: CLIENT_KINDS[item.id] } : {}) },
      };
  }
}
