import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';

const s = () => useDiagramStore.getState();

import { StateNode } from './StateNode';

function mount(data: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const node = { id: 's1', type: 'state', position: { x: 0, y: 0 }, data: { label: 'Idle', accent: '#abc', stateKind: 'state', ...data } } as unknown as DiagramNode;
  act(() => { s().reset(); s().addNode(node); });
  const P = StateNode as unknown as (p: unknown) => JSX.Element;
  const ui = (d: unknown) => <ReactFlowProvider><P id="s1" data={d} selected={false} {...props} /></ReactFlowProvider>;
  const r = render(ui(node.data));
  return { ...r, again: () => r.rerender(ui(s().nodes[0].data)) };
}

describe('StateNode', () => {
  beforeEach(() => { useUiStore.getState().resetUi(); });

  it.each([
    ['initial', 'circle.st-fill'],
    ['final', 'circle.st-ring'],
    ['choice', 'polygon.st-diamond'],
    ['fork', 'rect.st-fill'],
    ['join', 'rect.st-fill'],
    ['entryPoint', 'circle.st-ring'],
    ['history', 'text.st-hist-text'],
  ])('%s pseudo state renders %s with 4 handles', (k, sel) => {
    const { container } = mount({ stateKind: k }, { selected: true });
    expect(container.querySelector(sel)).toBeTruthy();
    expect(screen.getByTestId('state-s1').className).toContain('selected');
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(4);
  });

  it('final has ring and fill; entry has no cross; exit has cross', () => {
    const f = mount({ stateKind: 'final' });
    expect(f.container.querySelector('circle.st-ring')).toBeTruthy();
    expect(f.container.querySelector('circle.st-fill')).toBeTruthy();
    f.unmount();
    const e = mount({ stateKind: 'entryPoint' });
    expect(e.container.querySelector('.st-cross')).toBeNull();
    e.unmount();
    const x = mount({ stateKind: 'exitPoint' });
    expect(x.container.querySelector('.st-cross')).toBeTruthy();
  });

  it('history H vs deepHistory H*', () => {
    const a = mount({ stateKind: 'history' });
    expect(a.container.querySelector('.st-hist-text')!.textContent).toBe('H');
    a.unmount();
    const b = mount({ stateKind: 'deepHistory' });
    expect(b.container.querySelector('.st-hist-text')!.textContent).toBe('H*');
  });

  it('plain state: name, no activity section when none', () => {
    const { container } = mount({});
    expect(container.querySelector('.st-name')!.textContent).toBe('Idle');
    expect(container.querySelector('.st-act')).toBeNull();
  });

  it('activities shown without blank lines; edit via double click, commit and clear', () => {
    const m = mount({ activity: 'entry / a\n\nexit / b' });
    expect(m.container.querySelector('.st-act')!.textContent).toBe('entry / a\nexit / b');
    fireEvent.doubleClick(m.container.querySelector('.st-act')!);
    const ta = m.container.querySelector('textarea')!;
    expect(ta).toBeTruthy();
    fireEvent.change(ta, { target: { value: '  do / c  ' } });
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    expect((s().nodes[0].data as { activity?: string }).activity).toBe('do / c');
    expect(m.container.querySelector('textarea')).toBeNull();
    m.again();
    fireEvent.doubleClick(m.container.querySelector('.st-act')!);
    const t2 = m.container.querySelector('textarea')!;
    fireEvent.change(t2, { target: { value: '   ' } });
    fireEvent.keyDown(t2, { key: 'Enter', ctrlKey: true });
    expect((s().nodes[0].data as { activity?: string }).activity).toBeUndefined();
  });

  it('empty state opens activity editor only via act section; locked blocks both edits', () => {
    const m = mount({ activity: 'x', locked: true });
    fireEvent.doubleClick(m.container.querySelector('.st-act')!);
    expect(m.container.querySelector('textarea')).toBeNull();
    fireEvent.doubleClick(m.container.querySelector('.st-name')!);
    expect(useUiStore.getState().editingId).toBeNull();
  });

  it('name edit: commit trims, empty ignored', () => {
    const m = mount({});
    fireEvent.doubleClick(m.container.querySelector('.st-name')!);
    expect(useUiStore.getState().editingId).toBe('s1');
    m.again();
    const input = m.container.querySelector('input')!;
    fireEvent.change(input, { target: { value: ' Busy ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('Busy');
    act(() => useUiStore.getState().setEditing('s1'));
    m.again();
    const i2 = m.container.querySelector('input')!;
    fireEvent.change(i2, { target: { value: ' ' } });
    fireEvent.keyDown(i2, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('Busy');
  });
});

describe('StateNode activity editor without activity', () => {
  it('stays open with an empty value when the activity is removed meanwhile', () => {
    const m = mount({ activity: 'x' });
    fireEvent.doubleClick(m.container.querySelector('.st-act')!);
    act(() => s().updateState('s1', (d) => ({ ...d, activity: undefined })));
    m.again();
    expect((m.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });
});
