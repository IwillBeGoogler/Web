import { describe, expect, it } from 'vitest';
import { editNewNode } from './editOnAdd';
import { createNodesFromPaletteItem, getItem } from '../data/palette';
import { useUiStore } from '../store/uiStore';

describe('edit on add', () => {
  it('default label is the catalog name and edit mode starts', () => {
    const nodes = createNodesFromPaletteItem(getItem('postgresql')!, { x: 0, y: 0 }, (p) => p + '1');
    expect(nodes[0].data.label).toBe(getItem('postgresql')!.label);
    useUiStore.getState().setEditing(null);
    editNewNode(nodes);
    expect(useUiStore.getState().editingId).toBe(nodes[0].id);
  });
  it('multi-node adds do not enter edit', () => {
    useUiStore.getState().setEditing(null);
    editNewNode([]);
    expect(useUiStore.getState().editingId).toBeNull();
  });
});
