import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyText } from '../../lib/dsl/bridge';
import { compareWithCurrent } from '../../lib/smart/review';
import { useCommentsStore } from '../../comments/store';
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';
import { useDiffStore } from '../../versions/diffStore';
import { ReviewPanel } from './ReviewPanel';
import * as exportLib from '../../lib/export';

const s = () => useDiagramStore.getState();
const A = '#!sdd 1\nnode web "Web" icon=browser\nnode api "API" icon=service\nnode db "DB" icon=postgresql\nweb -> api "HTTPS"\napi -> db\n';

beforeEach(() => {
  s().reset();
  useSmart.getState().reset();
  useDiffStore.getState().clear();
  useCommentsStore.getState().reset();
});

describe('compare with the open file', () => {
  it('a copy with other ids compares as "no differences"', () => {
    applyText(A);
    const current = s().toProject();
    const copy = structuredClone(current);
    const ids = new Map(copy.pages[0].nodes.map((n, i) => [n.id, `copy_${i}`]));
    copy.pages[0].nodes = copy.pages[0].nodes.map((n) => ({ ...n, id: ids.get(n.id)! }));
    copy.pages[0].edges = copy.pages[0].edges.map((e) => ({ ...e, id: `x_${e.id}`, source: ids.get(e.source)!, target: ids.get(e.target)! }));
    copy.pages[0].id = 'other_page';
    expect(compareWithCurrent(copy, current).isEmpty).toBe(true);
  });
  it('finds added, removed and changed items against the current file', () => {
    applyText(A);
    const baseline = s().toProject();
    applyText('#!sdd 1\nnode web "Web app" icon=browser\nnode api "API" icon=service\nnode cache "Cache" icon=redis\nweb -> api "HTTPS"\napi -> cache\n');
    const d = compareWithCurrent(baseline, s().toProject());
    expect(d.nodes.added.map((n) => n.id)).toEqual(['cache']);
    expect(d.nodes.removed.map((n) => n.id)).toEqual(['db']);
    expect(d.nodes.changed.map((c) => c.id)).toEqual(['web']);
    expect(d.edges.added).toHaveLength(1);
    expect(d.edges.removed).toHaveLength(1);
  });
});

describe('ReviewPanel', () => {
  const setup = () => {
    applyText(A);
    const baseline = s().toProject();
    applyText('#!sdd 1\nnode web "Web app" icon=browser\nnode api "API" icon=service\nnode cache "Cache" icon=redis\nweb -> api "HTTPS"\napi -> cache\n');
    useDiffStore.getState().show(compareWithCurrent(baseline, s().toProject()), 'v1', 'Current');
    useSmart.getState().setDiff(true);
  };
  it('is closed by default and lists items with property detail', () => {
    const { rerender } = render(<ReviewPanel />);
    expect(screen.queryByTestId('review-panel')).toBeNull();
    act(setup);
    rerender(<ReviewPanel />);
    expect(screen.getByTestId('review-panel')).toHaveTextContent('v1 → Current');
    expect(screen.getAllByTestId('review-added').length).toBe(2); // node + edge
    expect(screen.getAllByTestId('review-removed').length).toBe(2);
    expect(screen.getByText(/label: “Web” → “Web app”/)).toBeInTheDocument();
  });
  it('clicking an item selects it on the canvas; closing clears the overlay', () => {
    act(setup);
    render(<ReviewPanel />);
    fireEvent.click(screen.getAllByTestId('review-changed')[0]);
    expect(s().nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(['web']);
    fireEvent.click(screen.getByLabelText('Close review'));
    expect(useDiffStore.getState().diff).toBeNull();
    expect(useSmart.getState().diff).toBe(false);
  });
  it('commenting needs the comment thread of this file; a comment is anchored to the node', async () => {
    act(setup);
    const { rerender } = render(<ReviewPanel />);
    expect(screen.queryByLabelText(/Comment on/)).toBeNull();
    const add = vi.fn(async () => ({ id: 'c1' }) as never);
    act(() => { useCommentsStore.setState({ fileId: s().projectId, add } as never); });
    rerender(<ReviewPanel />);
    fireEvent.click(screen.getByLabelText('Comment on Web app'));
    fireEvent.change(screen.getByLabelText('Review comment'), { target: { value: 'why rename?' } });
    fireEvent.submit(screen.getByLabelText('Review comment').closest('form')!);
    await vi.waitFor(() => expect(add).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith({ body: 'Review (v1 → Current): why rename?', anchor: { type: 'node', nodeId: 'web', dx: 0, dy: 0 } });
  });
  it('exports a Markdown report with the review comments', () => {
    act(setup);
    const spy = vi.spyOn(exportLib, 'downloadText').mockImplementation(() => undefined);
    act(() => {
      useCommentsStore.setState({ threads: [{ root: { id: 'c', fileId: 'f', parentId: null, author: { id: 'u', name: 'Alice' }, body: 'Review (v1 → Current): why rename?', anchor: { type: 'node', nodeId: 'web', dx: 0, dy: 0 }, resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1 }, replies: [] }] });
    });
    render(<ReviewPanel />);
    fireEvent.click(screen.getByText('Export report'));
    const [md, name] = spy.mock.calls[0];
    expect(String(md)).toMatch(/^# Change report:/);
    expect(String(md)).toContain('## Comments');
    expect(String(md)).toContain('**Alice** on *Web app*: why rename?');
    expect(String(name)).toMatch(/-changes\.md$/);
    spy.mockRestore();
  });
});
