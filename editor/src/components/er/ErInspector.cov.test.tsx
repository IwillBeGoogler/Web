import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { blankTable } from '../../lib/er/relations';
import { relationOf, tableOf } from '../../lib/er/tableData';
import { RelationInspector, TableInspector } from './ErInspector';

const s = () => useDiagramStore.getState();
const tbl = (id: string) => tableOf(s().nodes.find((n) => n.id === id)!);

function mountTable(id = 'a') {
  const Wrap = () => {
    const n = useDiagramStore((st) => st.nodes.find((x) => x.id === id)!);
    return <TableInspector node={n} />;
  };
  return render(<Wrap />);
}
const commit = (el: HTMLElement, v: string) => {
  fireEvent.change(el, { target: { value: v } });
  fireEvent.blur(el);
};

describe('TableInspector', () => {
  beforeEach(() => {
    s().reset();
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
  });
  it('edits name (ignores blank), schema, kind, colour, comment, collapse', () => {
    mountTable();
    commit(screen.getByLabelText('Table name'), '  people ');
    expect(tbl('a').label).toBe('people');
    commit(screen.getByLabelText('Table name'), '   ');
    expect(tbl('a').label).toBe('people');
    commit(screen.getByLabelText('Schema'), ' app ');
    expect(tbl('a').schema).toBe('app');
    commit(screen.getByLabelText('Schema'), '');
    expect(tbl('a').schema).toBeUndefined();
    commit(screen.getByLabelText('Table comment'), 'hello');
    expect(tbl('a').comment).toBe('hello');
    commit(screen.getByLabelText('Table comment'), '');
    expect(tbl('a').comment).toBeUndefined();
    fireEvent.click(screen.getByRole('switch', { name: /Show keys only/ }));
    expect(tbl('a').collapsed).toBe(true);
    fireEvent.change(screen.getByLabelText('Table kind'), { target: { value: 'view' } });
    expect(tbl('a').tableKind).toBe('view');
    fireEvent.click(screen.getByRole('button', { name: /^Header colour:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Header colour #e8710a' }));
    expect(tbl('a').accent.toLowerCase()).toBe('#e8710a');
  });
  it('enum kind hides schema, indexes and checks', () => {
    mountTable();
    fireEvent.change(screen.getByLabelText('Table kind'), { target: { value: 'enum' } });
    expect(screen.queryByLabelText('Schema')).toBeNull();
    expect(screen.queryByText('Add index')).toBeNull();
  });
  it('adds, edits, toggles and removes indexes', () => {
    mountTable();
    fireEvent.click(screen.getByText('Add index'));
    expect(tbl('a').indexes).toEqual([{ columns: ['id'], unique: false }]);
    commit(screen.getByLabelText('Index 1 name'), 'ix_a');
    expect(tbl('a').indexes[0].name).toBe('ix_a');
    commit(screen.getByLabelText('Index 1 name'), '');
    expect(tbl('a').indexes[0].name).toBeUndefined();
    commit(screen.getByLabelText('Index 1 columns'), 'id, name,, ');
    expect(tbl('a').indexes[0].columns).toEqual(['id', 'name']);
    fireEvent.click(screen.getByLabelText('Index 1 unique'));
    expect(tbl('a').indexes[0].unique).toBe(true);
    fireEvent.click(screen.getByLabelText('Remove index 1'));
    expect(tbl('a').indexes).toEqual([]);
  });
  it('index/check default to id when there are no columns', () => {
    act(() => s().updateTable('a', (d) => ({ ...d, columns: [] })));
    mountTable();
    fireEvent.click(screen.getByText('Add index'));
    fireEvent.click(screen.getByText('Add check'));
    expect(tbl('a').indexes[0].columns).toEqual(['id']);
    expect(tbl('a').checks[0].expr).toBe('id IS NOT NULL');
  });
  it('edits only the targeted entry among several indexes/checks; unset kind shows table', () => {
    act(() => s().updateTable('a', (d) => ({ ...d, tableKind: undefined, indexes: [{ columns: ['id'], unique: false }, { name: 'ix2', columns: ['name'], unique: true }], checks: [{ expr: 'a' }, { expr: 'b' }] })));
    mountTable();
    expect((screen.getByLabelText('Table kind') as HTMLSelectElement).value).toBe('table');
    commit(screen.getByLabelText('Index 2 name'), 'renamed');
    commit(screen.getByLabelText('Index 2 columns'), 'name,id');
    fireEvent.click(screen.getByLabelText('Index 2 unique'));
    expect(tbl('a').indexes).toEqual([{ columns: ['id'], unique: false }, { name: 'renamed', columns: ['name', 'id'], unique: false }]);
    commit(screen.getByLabelText('Check 2'), 'c');
    expect(tbl('a').checks.map((c) => c.expr)).toEqual(['a', 'c']);
    fireEvent.click(screen.getByLabelText('Remove check 1'));
    expect(tbl('a').checks.map((c) => c.expr)).toEqual(['c']);
  });
  it('adds, edits and removes checks', () => {
    mountTable();
    fireEvent.click(screen.getByText('Add check'));
    expect(tbl('a').checks[0].expr).toBe('id IS NOT NULL');
    commit(screen.getByLabelText('Check 1'), 'id > 0');
    expect(tbl('a').checks[0].expr).toBe('id > 0');
    fireEvent.click(screen.getByLabelText('Remove check 1'));
    expect(tbl('a').checks).toEqual([]);
  });
});

describe('RelationInspector', () => {
  beforeEach(() => {
    s().reset();
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    s().addNode(blankTable('b', { x: 400, y: 0 }, 'orders'));
    s().connectTables({ childId: 'b', parentId: 'a' });
  });
  const edge = () => s().edges[0];
  function mount() {
    const Wrap = () => {
      const e = useDiagramStore((st) => st.edges[0]);
      return <RelationInspector edge={e} />;
    };
    return render(<Wrap />);
  }
  it('renders nothing for a non-relation edge', () => {
    const { container } = render(<RelationInspector edge={{ id: 'x', source: 'a', target: 'b' } as never} />);
    expect(container.innerHTML).toBe('');
  });
  it('changes cardinality, toggles flags, reverses', () => {
    mount();
    const sel = screen.getByLabelText('Cardinality') as HTMLSelectElement;
    expect(sel.value).toBe('1:N');
    expect(screen.queryByText('Create junction table')).toBeNull();
    const o0 = relationOf(edge())!.optional;
    fireEvent.click(screen.getByRole('switch', { name: /Optional/ }));
    expect(relationOf(edge())!.optional).toBe(!o0);
    const i0 = relationOf(edge())!.identifying;
    fireEvent.click(screen.getByRole('switch', { name: /Identifying/ }));
    expect(relationOf(edge())!.identifying).toBe(!i0);
    const m0 = !!relationOf(edge())!.manyRequired;
    fireEvent.click(screen.getByRole('switch', { name: /Many side/ }));
    expect(!!relationOf(edge())!.manyRequired).toBe(!m0);
    const src = edge().source;
    fireEvent.click(screen.getByText('Reverse'));
    expect(edge().source).not.toBe(src);
    fireEvent.change(sel, { target: { value: '1:1' } });
    expect(relationOf(edge())!.cardinality).toBe('1:1');
  });
  it('N:M offers junction creation', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Cardinality'), { target: { value: 'N:M' } });
    fireEvent.click(screen.getByText('Create junction table'));
    expect(s().nodes.length).toBe(3);
  });
});
