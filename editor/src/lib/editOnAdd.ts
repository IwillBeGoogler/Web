import type { DiagramNode } from '../types';
import { useUiStore } from '../store/uiStore';

/** After adding a single labelled node from the palette, drop straight into label edit (text selected). */
export function editNewNode(nodes: DiagramNode[]): void {
  if (nodes.length !== 1) return;
  const n = nodes[0];
  if (n.type === 'icon' || n.type === 'text' || n.type === 'sticky') useUiStore.getState().setEditing(n.id);
}
