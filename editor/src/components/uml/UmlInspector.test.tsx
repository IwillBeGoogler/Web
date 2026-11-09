import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { SECTIONS } from '../../data/catalog';
import { registerUmlSection } from '../../data/uml';
import { createNodesFromPaletteItem } from '../../data/palette';
import { blankClass } from '../../lib/uml/geometry';
import { umlEdge } from '../../lib/uml/edges';
import { UML_REL_KINDS } from '../../lib/uml/types';
import { exercise } from '../../test/exercise';
import { ClassInspector, DiagramKindInspector, UmlRelationInspector } from './UmlInspector';
import type { DiagramNode } from '../../types';

registerUmlSection();
const s = () => useDiagramStore.getState();
beforeEach(() => s().reset());

function Node({ id, kind }: { id: string; kind: 'class' | 'other' }) {
  const n = useDiagramStore((st) => st.nodes.find((x) => x.id === id));
  if (!n) return <i data-testid="gone" />;
  return kind === 'class' ? <ClassInspector node={n} /> : <DiagramKindInspector node={n} />;
}
function Rel({ id }: { id: string }) {
  const e = useDiagramStore((st) => st.edges.find((x) => x.id === id));
  return e ? <UmlRelationInspector edge={e} /> : <i data-testid="gone" />;
}

describe('ClassInspector', () => {
  for (const kind of ['class', 'interface', 'abstract', 'enum'] as const)
    it(`edits a ${kind}`, () => {
      act(() => s().placeNodes([blankClass('c', { x: 0, y: 0 }, kind, 'Acct')]));
      const { container } = render(<Node id="c" kind="class" />);
      exercise(container);
      expect(s().nodes.length).toBeGreaterThanOrEqual(1);
    });
});

describe('DiagramKindInspector over every UML palette node', () => {
  const items = () => SECTIONS.filter((x) => x.id === 'uml').flatMap((x) => x.subs.flatMap((b) => b.items)).filter((i) => i.kind !== 'uml-rel');
  it('renders and edits each kind', () => {
    let k = 0;
    const seen = new Set<string>();
    for (const item of items()) {
      let made: DiagramNode[] = [];
      try { made = createNodesFromPaletteItem(item, { x: 0, y: 0 }, (p) => `${p}${k++}`); } catch { continue; }
      const n = made[0];
      if (!n || !['sequence', 'state', 'usecase', 'activity', 'component', 'deployment', 'object', 'timing'].includes(n.type ?? '')) continue;
      s().reset();
      act(() => s().placeNodes([...made, blankClass('cls', { x: 600, y: 0 }, 'class', 'Customer')]));
      const { container, unmount } = render(<Node id={n.id} kind="other" />);
      seen.add(`${n.type}:${String((n.data as Record<string, unknown>).compKind ?? (n.data as Record<string, unknown>).actKind ?? (n.data as Record<string, unknown>).stateKind ?? '')}`);
      expect(container.querySelector('.prop-row')).toBeTruthy();
      exercise(container);
      unmount();
    }
    expect(seen.size).toBeGreaterThan(8);
  });
});

describe('UmlRelationInspector', () => {
  for (const kind of UML_REL_KINDS)
    it(`edits a ${kind} relation`, () => {
      act(() => s().placeNodes([blankClass('a', { x: 0, y: 0 }, 'class', 'A'), blankClass('b', { x: 300, y: 0 }, 'class', 'B')]));
      act(() => s().addUmlEdge('a', 'b', { kind }));
      const id = s().edges[0]?.id;
      if (!id) return;
      const { container } = render(<Rel id={id} />);
      exercise(container);
    });
  it('returns nothing for a non-UML edge', () => {
    act(() => { s().addNode({ id: 'x', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'x', iconId: 'service' } } as DiagramNode); s().addNode({ id: 'y', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'y', iconId: 'service' } } as DiagramNode); s().addEdge({ source: 'x', target: 'y' } as never); });
    const { container } = render(<Rel id={s().edges[0].id} />);
    expect(container.textContent).toBe('');
  });
  it('relations between every element type (guards, events, messages, protocols)', () => {
    let k = 0;
    const byType = new Map<string, DiagramNode[]>();
    for (const item of SECTIONS.filter((x) => x.id === 'uml').flatMap((x) => x.subs.flatMap((b) => b.items)).filter((i) => i.kind !== 'uml-rel')) {
      try { const made = createNodesFromPaletteItem(item, { x: 0, y: 0 }, (p) => `${p}${k++}`); const n = made[0]; if (n) byType.set(n.type ?? '', [...(byType.get(n.type ?? '') ?? []), ...made]); } catch { /* skip */ }
    }
    expect(byType.size).toBeGreaterThan(5);
    for (const [, group] of byType) {
      const [a, b] = [group[0], group[1] ?? group[0]];
      for (const kind of UML_REL_KINDS) {
        s().reset();
        act(() => s().placeNodes(group.slice(0, 2).map((n, i) => ({ ...n, position: { x: i * 400, y: 0 } }))));
        act(() => { s().addUmlEdge(a.id, b.id, { kind, messages: kind === 'link' ? [] : undefined } as never); });
        const id = s().edges[0]?.id;
        if (!id) continue;
        const { container, unmount } = render(<Rel id={id} />);
        exercise(container);
        unmount();
      }
    }
  });
  it('component ports are editable', () => {
    let k = 0;
    const item = SECTIONS.filter((x) => x.id === 'uml').flatMap((x) => x.subs.flatMap((b) => b.items)).find((i) => /component/.test(i.id) && !/interface|provided|required/.test(i.id))!;
    const made = createNodesFromPaletteItem(item, { x: 0, y: 0 }, (p) => `${p}${k++}`);
    act(() => s().placeNodes(made));
    const { container } = render(<Node id={made[0].id} kind="other" />);
    exercise(container);
    const add = Array.from(container.querySelectorAll('button')).find((b) => /Add provided port/.test(b.textContent ?? ''));
    if (add) { act(() => { add.click(); }); exercise(container, { skipButtons: /Add|Remove/ }); }
    expect(container.querySelectorAll('select').length).toBeGreaterThan(0);
  });
});
