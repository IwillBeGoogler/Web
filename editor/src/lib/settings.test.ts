import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_SETTINGS, loadGlobalSettings, mergeSettings, resolveEdgeStyle, resolveNodeStyle, resolveSettings, saveGlobalSettings, SETTINGS_KEY, stripStyleOverrides,
  validateSettings,
} from './settings';
import { buildExportOptions } from './export';
import { useDiagramStore } from '../store/diagramStore';
import { createNodeFromPaletteItem, getItem } from '../data/palette';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
beforeEach(() => {
  localStorage.clear();
  s().reset();
});

describe('precedence: component > project > global > built-in', () => {
  it('built-in defaults are transparent / borderless', () => {
    expect(BUILTIN_SETTINGS.node).toMatchObject({ background: 'transparent', border: false, shadow: false });
    expect(BUILTIN_SETTINGS.group.fillOpacity).toBe(0);
    expect(BUILTIN_SETTINGS.edge.labelBackground).toBe(true); // label chip knocks the line out behind the text
    expect(BUILTIN_SETTINGS.export.transparent).toBe(false); // PNG export is white by default
  });
  it('global overrides built-in', () => {
    const r = resolveSettings({ node: { background: 'filled', fill: '#eef' } }, undefined);
    expect(r.node.background).toBe('filled');
    expect(r.node.fill).toBe('#eef');
    expect(r.node.border).toBe(false); // untouched built-in
  });
  it('project overrides global per key (deep merge)', () => {
    const r = resolveSettings({ node: { background: 'filled', fill: '#111', radius: 4 } }, { node: { fill: '#222' } });
    expect(r.node).toMatchObject({ background: 'filled', fill: '#222', radius: 4 });
  });
  it('component own value beats everything', () => {
    const settings = resolveSettings({ node: { background: 'filled', fill: '#111', border: true } }, { node: { fill: '#222' } });
    const node: DiagramNode = { id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a', fill: '#abc', border: false } };
    const v = resolveNodeStyle(node.data, 'icon', settings);
    expect(v).toMatchObject({ background: 'filled', fill: '#abc', border: false });
  });
  it('undefined values never override lower levels', () => {
    const r = mergeSettings({ node: { fill: '#111' } }, { node: { fill: undefined } });
    expect(r.node?.fill).toBe('#111');
  });
});

describe('resolved visuals', () => {
  const settings = resolveSettings(undefined, undefined);
  it('icon node: no fill, border or shadow by default', () => {
    const v = resolveNodeStyle({ label: 'x' }, 'icon', settings);
    expect(v).toMatchObject({ background: 'transparent', border: false, shadow: false });
  });
  it('group: transparent fill, dashed border by default', () => {
    expect(resolveNodeStyle({ label: 'g' }, 'group', settings)).toMatchObject({ fillOpacity: 0, borderStyle: 'dashed', border: true });
  });
  it('shapes keep a border; sticky is a filled card', () => {
    expect(resolveNodeStyle({ label: '' }, 'shape', settings)).toMatchObject({ border: true, background: 'transparent' });
    expect(resolveNodeStyle({ label: '' }, 'sticky', settings)).toMatchObject({ background: 'filled', fill: '#fff3a3' });
  });
  it('edge style resolves defaults then own values', () => {
    const r = resolveSettings({ edge: { color: '#0f7b6c', lineType: 'straight' } }, undefined);
    expect(resolveEdgeStyle({}, r)).toMatchObject({ color: '#0f7b6c', lineType: 'straight', arrows: 'end', labelBackground: true });
    expect(resolveEdgeStyle({ color: '#d1344a', labelBg: false }, r)).toMatchObject({ color: '#d1344a', labelBackground: false });
  });
});

describe('persistence', () => {
  it('round-trips global settings', () => {
    saveGlobalSettings(localStorage, { node: { background: 'filled' }, theme: 'dark' });
    expect(loadGlobalSettings(localStorage)).toEqual({ node: { background: 'filled' }, theme: 'dark' });
  });
  it('corrupt / invalid / throwing storage falls back to empty', () => {
    expect(loadGlobalSettings(localStorage)).toEqual({});
    localStorage.setItem(SETTINGS_KEY, '{bad');
    expect(loadGlobalSettings(localStorage)).toEqual({});
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ node: { background: 'glass' }, theme: 'dark' }));
    expect(loadGlobalSettings(localStorage)).toEqual({ theme: 'dark' }); // invalid key dropped, valid kept
    const boom = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadGlobalSettings(boom)).toEqual({});
    expect(() => saveGlobalSettings(boom, {})).not.toThrow();
  });
  it('canvas.sketch: off by default, validated as a boolean, merged per level', () => {
    expect(BUILTIN_SETTINGS.canvas.sketch).toBe(false);
    expect(resolveSettings().canvas.sketch).toBe(false);
    expect(validateSettings({ canvas: { sketch: true } })).toEqual({ canvas: { sketch: true } });
    expect(validateSettings({ canvas: { sketch: 'yes', gridSize: 10 } })).toEqual({ canvas: { gridSize: 10 } });
    expect(resolveSettings({ canvas: { sketch: true } }, undefined).canvas.sketch).toBe(true);
    expect(resolveSettings({ canvas: { sketch: true } }, { canvas: { gridSize: 40 } }).canvas).toMatchObject({ sketch: true, gridSize: 40 }); // other keys of the section never reset it
    expect(resolveSettings({ canvas: { sketch: true } }, { canvas: { sketch: false } }).canvas.sketch).toBe(false); // project beats global
    expect(resolveSettings(validateSettings({ canvas: { background: '#fff' } }), undefined).canvas.sketch).toBe(false); // existing saved settings stay unchanged
  });
  it('validateSettings keeps only valid fields', () => {
    expect(validateSettings({ node: { opacity: 50, fill: 7, border: true }, export: { scale: 5 }, canvas: { gridSize: 10 } })).toEqual({ node: { opacity: 50, border: true }, canvas: { gridSize: 10 } });
  });
  it('project settings are stored in the project JSON and survive round trip', () => {
    s().setProjectSettings({ node: { background: 'filled' } });
    const p = s().toProject();
    expect(p.settings).toEqual({ node: { background: 'filled' } });
    s().reset();
    s().loadProject(p);
    expect(s().projectSettings).toEqual({ node: { background: 'filled' } });
  });
});

describe('new nodes pick up current defaults', () => {
  it('a freshly created icon node follows settings changes; no baked-in style', () => {
    const node = createNodeFromPaletteItem(getItem('redis')!, { x: 0, y: 0 }, 'n');
    expect(node.data.fill).toBeUndefined();
    expect(node.data.background).toBeUndefined();
    const before = resolveNodeStyle(node.data, 'icon', resolveSettings(undefined, undefined));
    expect(before.background).toBe('transparent');
    const after = resolveNodeStyle(node.data, 'icon', resolveSettings({ node: { background: 'filled', fill: '#f5f5f5', radius: 12, shadow: true } }, undefined));
    expect(after).toMatchObject({ background: 'filled', fill: '#f5f5f5', radius: 12, shadow: true });
  });
  it('new edges follow default edge style', () => {
    const r = resolveSettings(undefined, { edge: { arrows: 'both', width: 3 } });
    expect(resolveEdgeStyle({}, r)).toMatchObject({ arrows: 'both', width: 3 });
  });
});

describe('apply defaults to all existing components (undoable)', () => {
  const add = () => {
    s().addNode({ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a', background: 'filled', fill: '#abc', border: true, shadow: true, radius: 2 } });
    s().addNode({ id: 'b', type: 'shape', position: { x: 300, y: 0 }, data: { label: 'b', fill: '#def', stroke: '#f00', strokeWidth: 4, opacity: 40 } });
    s().addNode({ id: 'c', type: 'sticky', position: { x: 600, y: 0 }, data: { label: 'c', fill: '#fff3a3' } });
    s().addEdge({ source: 'a', target: 'b', data: { color: '#d1344a', strokeWidth: 5, lineType: 'curved', arrows: 'both', labelBg: true } });
  };
  it('stripStyleOverrides removes style keys on icon/shape/group and edge style keys, keeps content', () => {
    add();
    const r = stripStyleOverrides(s().nodes, s().edges);
    expect(r.nodes.find((n) => n.id === 'a')!.data).toEqual({ label: 'a' });
    expect(r.nodes.find((n) => n.id === 'b')!.data).toEqual({ label: 'b' });
    expect(r.nodes.find((n) => n.id === 'c')!.data.fill).toBe('#fff3a3'); // sticky keeps its identity colour
    expect(r.edges[0].data).toEqual({});
  });
  it('store action applies, and a single undo restores everything', () => {
    add();
    const before = JSON.stringify([s().nodes, s().edges]);
    s().applyDefaultsToPage();
    expect(s().nodes.find((n) => n.id === 'a')!.data).toEqual({ label: 'a' });
    expect(s().edges[0].data).toEqual({});
    s().undo();
    expect(JSON.stringify([s().nodes, s().edges])).toBe(before);
    s().redo();
    expect(s().nodes.find((n) => n.id === 'a')!.data).toEqual({ label: 'a' });
  });
});

describe('export options', () => {
  const b = { x: 100, y: 50, width: 400, height: 200 };
  it('transparent: no background colour', () => {
    const o = buildExportOptions({ transparent: true, scale: 2, padding: 20 }, b, '#ffffff');
    expect(o.backgroundColor).toBeUndefined();
    expect(o.width).toBe(440);
    expect(o.pixelRatio).toBe(2);
    expect(o.style.transform).toContain('translate(-80px, -30px)');
  });
  it('opaque: white background whatever the canvas colour', () => {
    expect(buildExportOptions({ transparent: false, scale: 1, padding: 0 }, b, '#101820').backgroundColor).toBe('#ffffff');
    expect(buildExportOptions({ transparent: false, scale: 3, padding: 0 }, b, 'transparent').backgroundColor).toBe('#ffffff');
    expect(buildExportOptions({ transparent: false, scale: 3, padding: 0 }, b, 'transparent').pixelRatio).toBe(3);
  });
});
