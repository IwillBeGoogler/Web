import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const X = vi.hoisted(() => ({ executeAction: vi.fn() }));
vi.mock('../../lib/actions', () => X);
import { designSections } from './DesignSections';
import { useDiagramStore } from '../../store/diagramStore';
import { useLibraryDoc } from '../../lib/library/store';
import { addColorStyle, addEffectStyle, addTextStyle } from '../../lib/library/styles';
import { useWorkspace } from '../../workspace/store';
import type { DiagramNode } from '../../types';

const s = () => useDiagramStore.getState();
const n = (id: string, extra: Partial<DiagramNode> = {}, data: Record<string, unknown> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id, ...data }, ...extra }) as DiagramNode;
const load = (nodes: DiagramNode[]) => act(() => useDiagramStore.setState({ nodes, edges: [] }));

function Sections({ id, hasStyles = true }: { id: string; hasStyles?: boolean }) {
  const nodes = useDiagramStore((st) => st.nodes);
  const node = nodes.find((x) => x.id === id)!;
  return <div>{designSections(node, nodes, hasStyles).map((sec) => <section key={sec.id} data-sec={sec.id} aria-label={sec.label}>{sec.content}</section>)}</div>;
}
const ids = (id: string, hasStyles = true) => designSections(s().nodes.find((x) => x.id === id)!, s().nodes, hasStyles).map((x) => x.id);
const labelOf = (id: string, sec: string) => designSections(s().nodes.find((x) => x.id === id)!, s().nodes, true).find((x) => x.id === sec)!.label;
const sec = (name: string) => within(document.querySelector(`[data-sec="${name}"]`) as HTMLElement);
const btn = (group: string, label: string) => within(screen.getByRole('group', { name: group })).getByRole('button', { name: label });

beforeEach(() => {
  localStorage.clear();
  s().reset();
  X.executeAction.mockClear();
  useLibraryDoc.getState().close();
  useLibraryDoc.getState().open('p1');
});

describe('designSections: which sections appear', () => {
  it('plain node: link + styles; draw node without styles: link only; link label depends on having a link', () => {
    load([n('a'), n('d', { type: 'draw' as never })]);
    expect(ids('a')).toEqual(['link', 'styles']);
    expect(ids('d', false)).toEqual(['link']);
    expect(ids('d', true)).toEqual(['link', 'styles']);
    expect(labelOf('a', 'link')).toBe('Link & source');
    load([n('a', {}, { link: { fileId: 'f2' } })]);
    expect(labelOf('a', 'link')).toBe('Link');
  });
  it('group gets auto layout; child of an auto layout parent too; nested or framed nodes get constraints', () => {
    load([n('g', { type: 'group' as never }), n('c', { parentId: 'g' }), n('fr', { type: 'frame' as never, position: { x: 0, y: 0 }, width: 500, height: 500 }), n('in', { position: { x: 10, y: 10 } }), n('out', { position: { x: 900, y: 10 } })]);
    expect(ids('g')).toContain('autolayout');
    expect(ids('c')).toContain('constraints');
    expect(ids('c')).not.toContain('autolayout');
    expect(ids('in')).toContain('constraints');
    expect(ids('out')).not.toContain('constraints');
    load([n('g', { type: 'group' as never }, { autoLayout: { mode: 'row', gap: 8, padding: 8, align: 'start', justify: 'start' } }), n('c', { parentId: 'g' })]);
    expect(ids('c')).toContain('autolayout');
  });
  it('main component and instance sections; an instance of a deleted component says so', () => {
    useLibraryDoc.getState().update((l) => ({ ...l, components: { c1: { id: 'c1', name: 'Card', rev: 3, width: 1, height: 1, nodes: [], edges: [] } as never } }));
    load([n('m', {}, { componentMain: 'c1' }), n('i', {}, { instance: { componentId: 'c1' } }), n('x', {}, { componentMain: 'gone' }), n('k', {}, { instance: { componentId: 'gone' } })]);
    expect(labelOf('m', 'instance')).toBe('Main component');
    expect(labelOf('i', 'instance')).toBe('Instance');
    const r1 = render(<Sections id="m" />);
    expect(r1.container.textContent).toContain('Main component “Card” (revision 3)');
    r1.unmount();
    const r2 = render(<Sections id="x" />);
    expect(r2.container.textContent).toContain('Main component.');
    r2.unmount();
    const r3 = render(<Sections id="i" />);
    expect(r3.container.textContent).toContain('Instance of “Card”');
    for (const [name, action] of [['Go to main', 'go-to-main'], ['Reset overrides', 'reset-overrides'], ['Detach', 'detach-instance']] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(X.executeAction).toHaveBeenLastCalledWith(action, { nodeId: 'i' });
    }
    r3.unmount();
    render(<Sections id="k" />);
    expect(screen.getByText('Instance of a deleted component.')).toBeTruthy();
  });
});

describe('auto layout section', () => {
  const cfg = (extra: Record<string, unknown> = {}) => ({ mode: 'row', gap: 8, padding: 12, align: 'start', justify: 'start', ...extra });
  const layoutOf = () => s().nodes.find((x) => x.id === 'g')!.data.autoLayout as Record<string, unknown>;
  it('direction buttons run the matching action', () => {
    load([n('g', { type: 'group' as never })]);
    render(<Sections id="g" />);
    fireEvent.click(btn('Auto layout direction', 'Column'));
    expect(X.executeAction).toHaveBeenLastCalledWith('auto-layout:column', { nodeId: 'g' });
    fireEvent.click(btn('Auto layout direction', 'Off'));
    expect(X.executeAction).toHaveBeenLastCalledWith('auto-layout:off', { nodeId: 'g' });
    expect(screen.queryByLabelText('Gap')).toBeNull();
  });
  it('row mode: gap, padding, align, distribute, hug toggles write the config', () => {
    load([n('g', { type: 'group' as never }, { autoLayout: cfg() })]);
    render(<Sections id="g" />);
    fireEvent.change(screen.getByLabelText('Gap'), { target: { value: '20' } });
    expect(layoutOf().gap).toBe(20);
    fireEvent.change(screen.getByLabelText('Padding'), { target: { value: '5' } });
    expect(layoutOf().padding).toBe(5);
    fireEvent.click(btn('Cross alignment', 'Center'));
    expect(layoutOf().align).toBe('center');
    fireEvent.click(btn('Main alignment', 'Space'));
    expect(layoutOf().justify).toBe('between');
    fireEvent.click(btn('Container width', 'Hug W'));
    expect(layoutOf().hugW).toBe(true);
    fireEvent.click(btn('Container height', 'Hug H'));
    expect(layoutOf().hugH).toBe(true);
    fireEvent.click(btn('Container width', 'Fixed W'));
    expect(layoutOf().hugW).toBe(false);
    expect(screen.queryByLabelText('Columns')).toBeNull();
  });
  it('grid mode: columns (min 1, rounded), no distribute control', () => {
    load([n('g', { type: 'group' as never }, { autoLayout: cfg({ mode: 'grid' }) })]);
    render(<Sections id="g" />);
    const cols = screen.getByLabelText('Columns') as HTMLInputElement;
    expect(cols.value).toBe('3');
    fireEvent.change(cols, { target: { value: '0' } });
    expect(layoutOf().columns).toBe(1);
    fireEvent.change(cols, { target: { value: '4.4' } });
    expect(layoutOf().columns).toBe(4);
    expect(screen.queryByRole('group', { name: 'Main alignment' })).toBeNull();
  });
  it('child of an auto layout parent: sizing and absolute toggle', () => {
    load([n('g', { type: 'group' as never }, { autoLayout: cfg() }), n('c', { parentId: 'g' })]);
    render(<Sections id="c" />);
    expect(screen.queryByRole('group', { name: 'Auto layout direction' })).toBeNull();
    fireEvent.click(btn('Child width', 'Fill'));
    expect(s().nodes.find((x) => x.id === 'c')!.data.layoutSizing).toEqual({ w: 'fill', h: 'fixed' });
    fireEvent.click(btn('Child height', 'Fill'));
    expect(s().nodes.find((x) => x.id === 'c')!.data.layoutSizing).toEqual({ w: 'fill', h: 'fill' });
    const cb = screen.getByRole('checkbox', { name: /Ignore auto layout/ });
    fireEvent.click(cb);
    expect(s().nodes.find((x) => x.id === 'c')!.data.layoutAbsolute).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ignore auto layout/ }));
    expect(s().nodes.find((x) => x.id === 'c')!.data.layoutAbsolute).toBeUndefined();
  });
});

describe('constraints section', () => {
  it('shows defaults and writes both axes', () => {
    load([n('g', { type: 'group' as never }), n('c', { parentId: 'g' })]);
    render(<Sections id="c" />);
    expect(btn('Horizontal constraint', 'Left').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn('Horizontal constraint', 'Both'));
    fireEvent.click(btn('Vertical constraint', 'Scale'));
    expect(s().nodes.find((x) => x.id === 'c')!.data.constraints).toEqual({ h: 'stretch', v: 'scale' });
  });
});

describe('link section', () => {
  const tree = { folders: [], files: [{ id: 'p1', name: 'Main' }, { id: 'f2', name: 'Other' }] };
  beforeEach(() => {
    useWorkspace.setState({ tree } as never);
    useDiagramStore.setState({ projectId: 'p1' } as never);
  });
  it('choose a file, then a node (labelled only) or the whole file; clear the link', () => {
    load([n('a'), n('b', {}, { label: 'B node' }), n('c', {}, { label: '' })]);
    render(<Sections id="a" />);
    expect(screen.queryByLabelText('Link target node')).toBeNull();
    fireEvent.change(screen.getByLabelText('Link target file'), { target: { value: 'p1' } });
    expect(s().nodes.find((x) => x.id === 'a')!.data.link).toEqual({ fileId: 'p1' });
    expect(screen.getByRole('option', { name: 'Main (this file)' })).toBeTruthy();
    const target = screen.getByLabelText('Link target node') as HTMLSelectElement;
    expect(Array.from(target.options).map((o) => o.textContent)).toEqual(['Whole file', 'a', 'B node']);
    fireEvent.change(target, { target: { value: 'b' } });
    expect(s().nodes.find((x) => x.id === 'a')!.data.link).toEqual({ fileId: 'p1', nodeId: 'b' });
    fireEvent.change(screen.getByLabelText('Link target node'), { target: { value: '' } });
    expect(s().nodes.find((x) => x.id === 'a')!.data.link).toEqual({ fileId: 'p1' });
    fireEvent.click(screen.getByRole('button', { name: /Go to link/ }));
    expect(X.executeAction).toHaveBeenCalledWith('link-follow', { nodeId: 'a' });
    fireEvent.change(screen.getByLabelText('Link target file'), { target: { value: '' } });
    expect(s().nodes.find((x) => x.id === 'a')!.data.link).toBeUndefined();
    expect(screen.queryByRole('button', { name: /Go to link/ })).toBeNull();
  });
  it('link to another file with no stored content lists no nodes', () => {
    load([n('a', {}, { link: { fileId: 'f2' } })]);
    render(<Sections id="a" />);
    expect((screen.getByLabelText('Link target node') as HTMLSelectElement).options).toHaveLength(1);
  });
  it('source field trims and clears; backlinks list who points here and open them', () => {
    load([n('a'), n('b', {}, { label: 'Pointer', link: { fileId: 'p1', nodeId: 'a' } }), n('z', {}, { label: '', link: { fileId: 'p1', nodeId: 'a' } })]);
    render(<Sections id="a" />);
    const src = screen.getByLabelText('Source link');
    fireEvent.change(src, { target: { value: '  src/a.ts:1  ' } });
    fireEvent.blur(src);
    expect(s().nodes.find((x) => x.id === 'a')!.data.source).toBe('src/a.ts:1');
    fireEvent.change(screen.getByLabelText('Source link'), { target: { value: '   ' } });
    fireEvent.blur(screen.getByLabelText('Source link'));
    expect(s().nodes.find((x) => x.id === 'a')!.data.source).toBeUndefined();
    const back = within(screen.getByLabelText('Linked from'));
    fireEvent.click(back.getByRole('button', { name: /Pointer/ }));
    expect(X.executeAction).toHaveBeenCalledWith('link-open:p1:b');
    expect(back.getByRole('button', { name: /^z/ })).toBeTruthy(); // unlabelled falls back to the id
  });
  it('no backlinks: section absent', () => {
    load([n('a')]);
    render(<Sections id="a" />);
    expect(screen.queryByLabelText('Linked from')).toBeNull();
  });
});

describe('styles section', () => {
  const seed = (colors = true, texts = true, effects = true) => act(() => useLibraryDoc.getState().update((l) => {
    let d = l;
    if (colors) d = addColorStyle(d, { id: 'c1', name: 'Brand', value: '#112233', dark: '#445566' });
    if (colors) d = addColorStyle(d, { id: 'c2', name: 'Odd', value: 'red' });
    if (texts) d = addTextStyle(d, { id: 't1', name: 'Heading' });
    if (effects) d = addEffectStyle(d, { id: 'e1', name: 'Soft', shadow: null });
    return d;
  }));
  it('empty library: only the two add buttons; adding creates numbered styles from the node', () => {
    load([n('a', {}, { fill: '#abcdef', fontSize: 18, bold: true, align: 'center', textColor: '#111111' })]);
    render(<Sections id="a" />);
    expect(screen.queryByLabelText('Fill style')).toBeNull();
    expect(screen.queryByLabelText('Edit colour styles')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ Colour from fill' }));
    const doc = () => useLibraryDoc.getState().doc;
    expect(Object.values(doc().styles.colors).map((c) => [c.name, c.value])).toEqual([['Colour 1', '#abcdef']]);
    fireEvent.click(screen.getByRole('button', { name: '+ Text from this' }));
    expect(Object.values(doc().styles.texts)[0]).toMatchObject({ name: 'Text 1', fontSize: 18, bold: true, align: 'center', color: '#111111' });
  });
  it('colour add falls back to the default blue when the node has no fill', () => {
    load([n('a')]);
    render(<Sections id="a" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Colour from fill' }));
    expect(Object.values(useLibraryDoc.getState().doc.styles.colors)[0].value).toBe('#2f6fdb');
  });
  it('pickers apply or detach styles; edit rows rename, recolour, delete and show usage', () => {
    seed();
    load([n('a', {}, { styles: { fill: 'c1' } }), n('b', {}, { styles: { fill: 'c1' } })]);
    render(<Sections id="a" />);
    const fill = screen.getByLabelText('Fill style') as HTMLSelectElement;
    expect(fill.value).toBe('c1');
    expect((screen.getByLabelText('Stroke style') as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Stroke style'), { target: { value: 'c2' } });
    expect(X.executeAction).toHaveBeenLastCalledWith('style-apply:stroke:c2');
    fireEvent.change(fill, { target: { value: '' } });
    expect(X.executeAction).toHaveBeenLastCalledWith('style-detach:fill', { nodeId: 'a' });
    fireEvent.change(screen.getByLabelText('Text style'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Effect style'), { target: { value: 'e1' } });
    expect(X.executeAction).toHaveBeenLastCalledWith('style-apply:effect:e1');
    expect(screen.getByText('2 used')).toBeTruthy();
    expect(screen.getByText('0 used')).toBeTruthy();
    const name = screen.getByLabelText('Style name Brand');
    fireEvent.change(name, { target: { value: 'Primary' } });
    fireEvent.blur(name);
    expect(useLibraryDoc.getState().doc.styles.colors.c1.name).toBe('Primary');
    // colour fields: invalid CSS colours fall back to defaults in the swatch
    expect(screen.getByRole('button', { name: 'Odd light: #2f6fdb' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Odd dark: #7aa2ff' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Primary dark: #445566' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Primary light: #112233' }));
    const lightSwatch = within(screen.getByRole('group', { name: 'Primary light presets' })).getAllByRole('button')[1];
    fireEvent.click(lightSwatch);
    expect(useLibraryDoc.getState().doc.styles.colors.c1.value).toBe(lightSwatch.getAttribute('title'));
    fireEvent.click(screen.getByRole('button', { name: 'Primary dark: #445566' }));
    const darkSwatch = within(screen.getByRole('group', { name: 'Primary dark presets' })).getAllByRole('button')[1];
    fireEvent.click(darkSwatch);
    expect(useLibraryDoc.getState().doc.styles.colors.c1.dark).toBe(darkSwatch.getAttribute('title'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete style Odd' }));
    expect(useLibraryDoc.getState().doc.styles.colors.c2).toBeUndefined();
  });
});
