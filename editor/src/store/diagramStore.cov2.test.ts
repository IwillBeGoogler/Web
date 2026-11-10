import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramNode } from '../types';
import { useDiagramStore } from './diagramStore';

const s = () => useDiagramStore.getState();
const nd = (id: string, type: string, data: Record<string, unknown> = {}, x = 0): DiagramNode =>
  ({ id, type, position: { x, y: 0 }, width: 100, height: 60, data: { label: id, ...data } }) as DiagramNode;

beforeEach(() => {
  s().reset();
});

describe('connect', () => {
  it('ignores connections missing an end', () => {
    s().connect({ source: 'a', target: null as never, sourceHandle: null, targetHandle: null });
    expect(s().edges).toHaveLength(0);
  });
  it('class to class draws an association', () => {
    useDiagramStore.setState({ nodes: [nd('c1', 'class'), nd('c2', 'class', {}, 300)] });
    s().connect({ source: 'c1', target: 'c2', sourceHandle: null, targetHandle: null });
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0].data?.uml?.kind).toBe('association');
  });
  it('uml note and class get a note link, in either direction', () => {
    useDiagramStore.setState({ nodes: [nd('n', 'sticky', { umlNote: true }), nd('c', 'class', {}, 300)] });
    s().connect({ source: 'c', target: 'n', sourceHandle: null, targetHandle: null });
    expect(s().edges[0].source).toBe('n');
    expect(s().edges[0].target).toBe('c');
    expect(s().edges[0].data?.uml?.kind).toBe('note');
  });
  it('producer to kafka cluster keeps direction and labels the first topic', () => {
    useDiagramStore.setState({
      nodes: [nd('p', 'icon', { clientKind: 'producer' }), nd('k', 'cluster', { profileId: 'kafka', params: { topics: [{ name: 'orders' }] } }, 300)],
    });
    s().connect({ source: 'p', target: 'k', sourceHandle: 'h1', targetHandle: 'h2' });
    expect(s().edges[0]).toMatchObject({ source: 'p', target: 'k', label: 'orders' });
  });
  it('consumer dropped onto the client first is flipped out of the cluster and defaults the topic label', () => {
    useDiagramStore.setState({
      nodes: [nd('c', 'icon', { clientKind: 'consumer' }), nd('k', 'cluster', { iconId: 'kafka' }, 300)],
    });
    s().connect({ source: 'c', target: 'k', sourceHandle: 'a', targetHandle: 'b' });
    expect(s().edges[0]).toMatchObject({ source: 'k', target: 'c', sourceHandle: 'b', targetHandle: 'a', label: 'topic' });
  });
});

describe('addEdge draw-in marker', () => {
  it('drops edge-new after the timeout and leaves already-changed edges alone', () => {
    vi.useFakeTimers();
    try {
      useDiagramStore.setState({ nodes: [nd('a', 'icon'), nd('b', 'icon', {}, 300)] });
      s().addEdge({ source: 'a', target: 'b', id: 'e1' } as never);
      s().addEdge({ source: 'b', target: 'a', id: 'e2' } as never);
      useDiagramStore.setState((st) => ({ edges: st.edges.map((e) => (e.id === 'e2' ? { ...e, className: 'other' } : e)) }));
      vi.advanceTimersByTime(800);
      expect(s().edges.find((e) => e.id === 'e1')?.className).toBeUndefined();
      expect(s().edges.find((e) => e.id === 'e2')?.className).toBe('other');
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects self loops and unknown ends', () => {
    useDiagramStore.setState({ nodes: [nd('a', 'icon')] });
    s().addEdge({ source: 'a', target: 'a' } as never);
    s().addEdge({ source: 'a', target: 'zz' } as never);
    expect(s().edges).toHaveLength(0);
  });
});
