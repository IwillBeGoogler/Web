import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { executeAction } from '../actions';
import { ER, footerLines, rowCenterY, tableSize, visibleColumns, withTableSize } from './geometry';
import type { TableNodeData } from './tableData';

const data = (over: Partial<TableNodeData> = {}): TableNodeData => ({
  label: 'orders',
  columns: [
    { id: 'c0', name: 'id', type: 'bigint', pk: true, nullable: false, unique: false },
    { id: 'c1', name: 'user_id', type: 'bigint', pk: false, nullable: false, unique: false, fk: { table: 'users', column: 'id' } },
    { id: 'c2', name: 'total', type: 'numeric(12,2)', pk: false, nullable: false, unique: false },
  ],
  indexes: [{ columns: ['user_id'], unique: false }],
  checks: [],
  accent: '#3b6cff',
  collapsed: false,
  ...over,
}) as TableNodeData;

const node = (id: string, d: TableNodeData): DiagramNode => withTableSize({ id, type: 'table', position: { x: 0, y: 0 }, data: d as unknown as DiagramNode['data'] });

describe('compact tables', () => {
  it('a compact table is a header plus the count line: no rows, no footer, narrow, relations at the header centre', () => {
    const full = data();
    const compact = data({ compact: true });
    expect(visibleColumns(compact)).toEqual([]);
    expect(footerLines(compact)).toBe(0);
    expect(tableSize(compact).height).toBe(ER.headerH + ER.compactLine + ER.bottomPad);
    expect(tableSize(compact).height).toBeLessThan(tableSize(full).height);
    expect(tableSize(compact).width).toBeLessThanOrEqual(tableSize(full).width);
    expect(tableSize(compact).width).toBeGreaterThanOrEqual(ER.compactMinW);
    expect(rowCenterY(compact, 'c1')).toBe(ER.headerH / 2);
  });

  describe('actions', () => {
    beforeEach(() => {
      useDiagramStore.setState({ nodes: [node('a', data()), node('b', data({ label: 'users', collapsed: true }))], edges: [] });
    });
    const sizes = () => useDiagramStore.getState().nodes.map((n) => [n.data.compact ?? false, n.height]);

    it('compact all resizes every table in one undo step; expand all brings the columns back', () => {
      executeAction('er-compact-all');
      const h = ER.headerH + ER.compactLine + ER.bottomPad;
      expect(sizes()).toEqual([[true, h], [true, h]]);
      useDiagramStore.getState().undo();
      expect(sizes().map(([c]) => c)).toEqual([false, false]);
      executeAction('er-compact-all');
      executeAction('er-expand-all');
      const nodes = useDiagramStore.getState().nodes;
      expect(nodes.every((n) => !n.data.compact && !n.data.collapsed)).toBe(true);
      expect(nodes[0].height).toBe(tableSize(data()).height);
    });

    it('table-compact toggles one table', () => {
      executeAction('table-compact', { nodeId: 'a' });
      expect(sizes().map(([c]) => c)).toEqual([true, false]);
      executeAction('table-compact', { nodeId: 'a' });
      expect(sizes().map(([c]) => c)).toEqual([false, false]);
    });
  });
});
