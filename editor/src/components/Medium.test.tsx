import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { createStoredProject } from '../lib/projects';
import type { DiagramNode } from '../types';

const n = (id: string, type: DiagramNode['type'], data: DiagramNode['data'], extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type, position: { x: 100, y: 100 }, width: 200, height: 120, data, ...extra });

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  const p = createStoredProject(localStorage, 'Medium');
  render(<App initialProjectId={p.id} />);
});
const load = async (nodes: DiagramNode[]) => act(async () => useDiagramStore.getState().loadDiagram({ nodes, edges: [] }));

describe('medium style nodes render', () => {
  it('card shows title, coloured tags and adds a tag', async () => {
    await load([n('c', 'card', { label: 'API', iconId: 'go', layout: 'vertical', tags: [{ text: 'prod', color: '#1971c2' }, { text: 'eu', color: '#d9480f' }] }, { selected: true })]);
    expect(screen.getByText('API')).toBeTruthy();
    const tags = screen.getAllByTestId('card-tag');
    expect(tags.map((t) => t.textContent)).toEqual(['prod', 'eu']);
    expect(tags[0].getAttribute('style')).toContain('#1971c2');
    await act(async () => fireEvent.click(screen.getByLabelText('Add tag')));
    expect(useDiagramStore.getState().nodes[0].data.tags).toHaveLength(3);
  });
  it('card tag edits on double-click', async () => {
    await load([n('c', 'card', { label: 'API', layout: 'horizontal', tags: [{ text: 'prod', color: '#1971c2' }] })]);
    await act(async () => fireEvent.doubleClick(screen.getByTestId('card-tag')));
    const input = screen.getByLabelText('Tag 1') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'staging' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(useDiagramStore.getState().nodes[0].data.tags![0].text).toBe('staging');
  });
  it('cylinder + ellipsis shapes render', async () => {
    await load([n('s', 'shape', { label: 'DB', shape: 'cylinder' }), n('e', 'shape', { label: '', shape: 'ellipsis' }, { position: { x: 400, y: 100 }, width: 48, height: 28 })]);
    expect(screen.getByTestId('cylinder-svg')).toBeTruthy();
    expect(screen.getByTestId('ellipsis')).toBeTruthy();
  });
  it('dashed group shows its caption; card group shows its subtitle', async () => {
    await load([
      n('g1', 'group', { label: 'Host', variant: 'dashed', caption: 'bare metal' }, { width: 300, height: 200 }),
      n('g2', 'group', { label: 'Backend', variant: 'card', subtitle: 'prod', accent: '#0c8599' }, { position: { x: 500, y: 100 }, width: 300, height: 200 }),
    ]);
    expect(screen.getByTestId('group-caption').textContent).toBe('bare metal');
    expect(screen.getByText('prod')).toBeTruthy();
    expect(document.querySelector('.node-group.variant-card')).toBeTruthy();
  });
  it('icon caption colours', async () => {
    await load([n('i', 'icon', { label: 'Vector', iconId: 'vector', subtitle: ':8686', labelColor: '#d9480f', subtitleColor: '#6b7280' })]);
    expect(screen.getByText('Vector').getAttribute('style')).toContain('rgb(217, 72, 15)');
    expect(screen.getByText(':8686').getAttribute('style')).toContain('rgb(107, 114, 128)');
  });
  it('junction renders and has no visible label', async () => {
    await load([n('j', 'junction', { label: '' }, { width: 10, height: 10 })]);
    expect(screen.getByTestId('junction')).toBeTruthy();
  });
});
