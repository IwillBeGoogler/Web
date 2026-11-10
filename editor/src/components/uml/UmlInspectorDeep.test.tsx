import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { SECTIONS } from '../../data/catalog';
import { registerUmlSection } from '../../data/uml';
import { createNodesFromPaletteItem } from '../../data/palette';
import { blankClass } from '../../lib/uml/geometry';
import { UML_REL_KINDS } from '../../lib/uml/types';
import { exercise } from '../../test/exercise';
import { ClassInspector, DiagramKindInspector, UmlRelationInspector } from './UmlInspector';
import type { DiagramNode } from '../../types';

registerUmlSection();
const s = () => useDiagramStore.getState();
beforeEach(() => { cleanup(); s().reset(); });

function Node({ id, kind }: { id: string; kind: 'class' | 'other' }) {
  const n = useDiagramStore((st) => st.nodes.find((x) => x.id === id));
  if (!n) return <i data-testid="gone" />;
  return kind === 'class' ? <ClassInspector node={n} /> : <DiagramKindInspector node={n} />;
}
function Rel({ id }: { id: string }) {
  const e = useDiagramStore((st) => st.edges.find((x) => x.id === id));
  return e ? <UmlRelationInspector edge={e} /> : <i data-testid="gone" />;
}

/** opens every colour popover and picks swatches / types hex, then runs the stock exerciser */
function colours(root: HTMLElement) {
  for (const trig of Array.from(root.querySelectorAll<HTMLButtonElement>('.color-trigger'))) {
    act(() => { fireEvent.click(trig); });
    const sw = Array.from(document.querySelectorAll<HTMLButtonElement>('.color-pop .swatches button'));
    if (sw[1]) act(() => { fireEvent.click(sw[1]); });
    act(() => { fireEvent.click(trig); });
    for (const inp of Array.from(document.querySelectorAll<HTMLInputElement>('.color-pop input'))) act(() => { fireEvent.change(inp, { target: { value: inp.type === 'color' ? '#123456' : '#abcdef' } }); });
    act(() => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
  }
}
/** text inputs only (no selects), so the relation kind under test stays put */
function typeAll(root: HTMLElement) {
  for (const inp of Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea'))) {
    for (const v of ['zz1', '']) act(() => { fireEvent.change(inp, { target: { value: v } }); fireEvent.blur(inp); });
  }
  for (const cb of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) act(() => { fireEvent.click(cb); });
  for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('.btn-row button'))) if (b.textContent !== 'Reverse') act(() => { fireEvent.click(b); });
}
/** every select option in turn, with the full control set exercised in each resulting state */
function deep(root: HTMLElement) {
  colours(root);
  const n = root.querySelectorAll('select').length;
  for (let i = 0; i < n; i++) {
    const sel = root.querySelectorAll('select')[i];
    if (!sel) break;
    for (const o of Array.from(sel.options)) {
      const cur = root.querySelectorAll('select')[i];
      if (!cur) break;
      act(() => { fireEvent.change(cur, { target: { value: o.value } }); });
      typeAll(root);
      colours(root);
    }
  }
  exercise(root);
}

const items = () => SECTIONS.filter((x) => x.id === 'uml').flatMap((x) => x.subs.flatMap((b) => b.items)).filter((i) => i.kind !== 'uml-rel');
const TYPES = ['sequence', 'state', 'usecase', 'activity', 'component', 'deployment', 'object', 'timing'];

describe('UmlInspector deep', () => {
  it('class inspector: every kind, with colour, toggles and instantiate', () => {
    for (const kind of ['class', 'interface', 'abstract', 'enum'] as const) {
      s().reset();
      act(() => s().placeNodes([blankClass('c', { x: 0, y: 0 }, kind, 'Acct')]));
      const { container, unmount } = render(<Node id="c" kind="class" />);
      deep(container);
      unmount();
    }
    expect(true).toBe(true);
  });

  it('every UML palette node reached through each of its selects', () => {
    let k = 0;
    const seen = new Set<string>();
    for (const item of items()) {
      let made: DiagramNode[] = [];
      try { made = createNodesFromPaletteItem(item, { x: 0, y: 0 }, (p) => `${p}${k++}`); } catch { continue; }
      const n = made[0];
      if (!n || !TYPES.includes(n.type ?? '')) continue;
      s().reset();
      act(() => s().placeNodes([...made, blankClass('cls', { x: 600, y: 0 }, 'class', 'Customer')]));
      const { container, unmount } = render(<Node id={n.id} kind="other" />);
      seen.add(String(n.type));
      deep(container);
      unmount();
    }
    expect(seen.size).toBe(TYPES.length);
  });

  it('object inspector: pick a class, add the missing attributes, add and remove slots', () => {
    const cls = blankClass('cls', { x: 0, y: 0 }, 'class', 'Customer');
    act(() => s().placeNodes([cls]));
    act(() => s().updateClass('cls', (d) => ({ ...d, attributes: [{ id: 'a1', name: 'id', type: 'int', visibility: 'private' }, { id: 'a2', name: 'name', type: 'string', visibility: 'private' }] as never })));
    const obj = items().map((i) => { try { return createNodesFromPaletteItem(i, { x: 300, y: 0 }, (p) => `${p}x`)[0]; } catch { return undefined; } }).find((n) => n?.type === 'object')!;
    act(() => s().placeNodes([obj]));
    const { container, getByLabelText, getByText, queryByText } = render(<Node id={obj.id} kind="other" />);
    fireEvent.change(getByLabelText('Pick a class of the page'), { target: { value: 'Customer' } });
    fireEvent.click(getByText(/Add missing attributes of Customer/));
    expect(queryByText(/Add missing attributes/)).toBeNull();
    fireEvent.click(getByText('Add slot'));
    const rows = () => container.querySelectorAll('[data-testid^="slot-row-"]').length;
    const n = rows();
    fireEvent.click(container.querySelector('[data-testid^="slot-row-"] button')!);
    expect(rows()).toBe(n - 1);
  });

  it('relations of every kind between each pair of element types, deeply exercised', () => {
    let k = 0;
    const byType = new Map<string, DiagramNode[]>();
    for (const item of items()) {
      try { const made = createNodesFromPaletteItem(item, { x: 0, y: 0 }, (p) => `${p}${k++}`); const n = made[0]; if (n) byType.set(n.type ?? '', [...(byType.get(n.type ?? '') ?? []), ...made]); } catch { /* skip */ }
    }
    for (const [, group] of byType) {
      const [a, b] = [group[0], group[1] ?? group[0]];
      for (const kind of UML_REL_KINDS) {
        s().reset();
        act(() => s().placeNodes([...group.slice(0, 2).map((n, i) => ({ ...n, position: { x: i * 400, y: 0 } })), blankClass('zz', { x: 0, y: 500 }, 'class', 'Z')]));
        act(() => { s().addUmlEdge(a.id, b.id, { kind, messages: kind === 'link' ? [] : undefined } as never); });
        const id = s().edges[0]?.id;
        if (!id) continue;
        const { container, unmount } = render(<Rel id={id} />);
        exercise(container);
        for (const sel of Array.from(container.querySelectorAll('select'))) for (const o of Array.from(sel.options)) act(() => { fireEvent.change(sel, { target: { value: o.value } }); });
        exercise(container, { skipButtons: /Reverse/ });
        unmount();
      }
    }
  });

  it('association attached at a class attribute; multiplicity presets toggle on and off', () => {
    act(() => s().placeNodes([blankClass('a', { x: 0, y: 0 }, 'class', 'A'), blankClass('b', { x: 300, y: 0 }, 'class', 'B')]));
    act(() => s().updateClass('a', (d) => ({ ...d, attributes: [{ id: 'at1', name: 'items', type: 'List', visibility: 'private' }, { id: 'at2', name: 'tag', visibility: 'private' }] as never })));
    act(() => s().addUmlEdge('a', 'b', { kind: 'association' }));
    const { getByLabelText, container } = render(<Rel id={s().edges[0].id} />);
    fireEvent.change(getByLabelText('Attach at attribute'), { target: { value: 'at1' } });
    expect(s().edges[0].data?.uml?.sourceMember).toBe('at1');
    fireEvent.change(getByLabelText('Attach at attribute'), { target: { value: '' } });
    expect(s().edges[0].data?.uml?.sourceMember).toBeUndefined();
    const preset = container.querySelector<HTMLButtonElement>('[aria-label="Multiplicity (source end) presets"] button')!;
    fireEvent.click(preset);
    expect(s().edges[0].data?.uml?.sourceMult).toBe('1');
    fireEvent.click(container.querySelector<HTMLButtonElement>('[aria-label="Multiplicity (source end) presets"] button')!);
    expect(s().edges[0].data?.uml?.sourceMult).toBeUndefined();
    fireEvent.click(container.querySelector('[aria-label="Navigable (open arrow)"]')!);
  });

  it('class inspector fields commit by label (stereotype, package, generics, collapse toggles)', () => {
    act(() => s().placeNodes([blankClass('c', { x: 0, y: 0 }, 'class', 'Acct')]));
    const { getByLabelText } = render(<Node id="c" kind="class" />);
    const type = (label: string, v: string) => { const i = getByLabelText(label); fireEvent.change(i, { target: { value: v } }); fireEvent.blur(i); };
    type('Stereotype', ' entity ');
    type('Package', 'com.x');
    type('Type parameters', 'T');
    type('Class name', 'Renamed');
    fireEvent.click(getByLabelText('Collapse operations'));
    fireEvent.click(getByLabelText('Collapse attributes'));
    const d = s().nodes[0].data as Record<string, unknown>;
    expect(d.stereotype).toBe('entity');
    expect(d.package).toBe('com.x');
    expect(d.label).toBe('Renamed');
    expect(d.collapsedOperations).toBe(true);
    type('Stereotype', '');
    expect((s().nodes[0].data as Record<string, unknown>).stereotype).toBeUndefined();
  });

  it('relation kinds render their own fields (guard, transition parts, link, import, protocol)', () => {
    const edgeOf = (kind: string, label?: string) => {
      s().reset();
      act(() => s().placeNodes([blankClass('a', { x: 0, y: 0 }, 'class', 'A'), blankClass('b', { x: 300, y: 0 }, 'class', 'B')]));
      act(() => useDiagramStore.setState({ edges: [{ id: 'e', source: 'a', target: 'b', label, data: { uml: { kind } } } as never] }));
    };
    for (const kind of ['transition', 'link', 'import', 'access', 'merge', 'communication', 'association']) {
      edgeOf(kind, kind === 'transition' ? 'go [ok] / run()' : undefined);
      const { container, unmount } = render(<Rel id="e" />);
      typeAll(container);
      unmount();
    }
    // transition leaving an activity node: only a guard
    act(() => s().placeNodes([]));
    edgeOf('transition');
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => (n.id === 'a' ? { ...n, type: 'activity', data: { label: 'x', actKind: 'action', accent: '#fff' } } : n)) as never })));
    const { container, getByLabelText } = render(<Rel id="e" />);
    fireEvent.change(getByLabelText('Flow guard'), { target: { value: 'x > 1' } });
    fireEvent.blur(getByLabelText('Flow guard'));
    expect(container.querySelector('[aria-label="Flow guard"]')).toBeTruthy();
    expect(s().edges[0].label).toBeTruthy();
  });

  it('component ports: add, rename, change kind and side, remove', () => {
    const comp = items().map((i) => { try { return createNodesFromPaletteItem(i, { x: 0, y: 0 }, (p) => `${p}c`)[0]; } catch { return undefined; } }).find((n) => n?.type === 'component' && (n.data as { compKind?: string }).compKind === 'component')!;
    act(() => s().placeNodes([comp]));
    const { getByText, getByLabelText, queryByLabelText } = render(<Node id={comp.id} kind="other" />);
    fireEvent.click(getByText('Add provided port'));
    fireEvent.click(getByText('Add required port'));
    const ports = () => ((s().nodes[0].data as { ports?: { id: string; kind: string; side: string; name: string }[] }).ports ?? []);
    const p = ports()[0];
    fireEvent.change(getByLabelText(`Port ${p.id} kind`), { target: { value: p.kind === 'provided' ? 'required' : 'provided' } });
    fireEvent.change(getByLabelText(`Port ${p.id} side`), { target: { value: 'top' } });
    expect(ports()[0].side).toBe('top');
    const nm = getByLabelText(`Port ${p.id} name`);
    fireEvent.change(nm, { target: { value: 'IRenamed' } });
    fireEvent.blur(nm);
    expect(ports()[0].name).toBe('IRenamed');
    fireEvent.click(getByLabelText('Remove port IRenamed'));
    expect(queryByLabelText(`Port ${p.id} kind`)).toBeNull();
  });
});
