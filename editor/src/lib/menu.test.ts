import { describe, expect, it } from 'vitest';
import { getMenuItems, flattenMenu, type MenuContext, type MenuItem } from './menu';
import type { DiagramEdge, DiagramNode } from '../types';

const n = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id }, ...extra });
const e = (id: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source: 'a', target: 'b', ...extra });
const ctx = (over: Partial<MenuContext> = {}): MenuContext => ({
  nodes: [], edges: [], hasClipboard: false, hasStyleClip: false, pageCount: 1, ...over,
});
const ids = (items: MenuItem[]) => flattenMenu(items).map((i) => i.id);
const find = (items: MenuItem[], id: string) => flattenMenu(items).find((i) => i.id === id);

describe('node menu', () => {
  const c = ctx({ nodes: [n('a', { selected: true })] });
  const items = getMenuItems({ type: 'node', id: 'a' }, c);
  it('has the expected actions', () => {
    for (const id of ['edit-label', 'cut', 'copy', 'paste', 'duplicate', 'copy-style', 'paste-style', 'change-icon', 'bring-front', 'bring-forward', 'send-backward', 'send-back', 'group', 'lock', 'delete'])
      expect(ids(items), id).toContain(id);
  });
  it('shortcuts shown', () => {
    expect(find(items, 'copy')!.shortcut).toBe('⌘C');
    expect(find(items, 'delete')!.shortcut).toBe('⌫');
  });
  it('paste disabled with empty clipboard, enabled otherwise', () => {
    expect(find(items, 'paste')!.disabled).toBe(true);
    const on = getMenuItems({ type: 'node', id: 'a' }, { ...c, hasClipboard: true });
    expect(find(on, 'paste')!.disabled).toBeFalsy();
  });
  it('paste-style disabled without style clipboard', () => {
    expect(find(items, 'paste-style')!.disabled).toBe(true);
    expect(find(getMenuItems({ type: 'node', id: 'a' }, { ...c, hasStyleClip: true }), 'paste-style')!.disabled).toBeFalsy();
  });
  it('delete is last and danger; no ungroup/unlock/remove-from-group', () => {
    expect(items[items.length - 1]).toMatchObject({ id: 'delete', danger: true });
    for (const id of ['ungroup', 'unlock', 'remove-from-group', 'align:left']) expect(ids(items)).not.toContain(id);
  });
  it('unlock instead of lock when locked; remove-from-group only for children', () => {
    const locked = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [n('a', { selected: true, data: { label: 'a', locked: true } })] }));
    expect(ids(locked)).toContain('unlock');
    expect(ids(locked)).not.toContain('lock');
    const child = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [n('a', { selected: true, parentId: 'g' })] }));
    expect(ids(child)).toContain('remove-from-group');
  });
  it('shapes get style submenu and no change-icon', () => {
    const shape = getMenuItems({ type: 'node', id: 's' }, ctx({ nodes: [n('s', { type: 'shape', selected: true })] }));
    expect(ids(shape)).toContain('strokeStyle:dashed');
    expect(ids(shape).some((i) => i.startsWith('fill:'))).toBe(true);
    expect(ids(shape)).not.toContain('change-icon');
  });
  it('submenus hold arrange children', () => {
    const arrange = items.find((i) => i.id === 'arrange')!;
    expect(arrange.children!.map((x) => x.id)).toEqual(['bring-front', 'bring-forward', 'send-backward', 'send-back']);
  });
});

describe('group menu', () => {
  const items = getMenuItems({ type: 'node', id: 'g' }, ctx({ nodes: [n('g', { type: 'group', selected: true })] }));
  it('has group actions only', () => {
    for (const id of ['rename', 'select-children', 'ungroup', 'delete-group-only', 'delete-group-with-children', 'lock', 'arrange'])
      expect(ids(items), id).toContain(id);
    expect(ids(items)).not.toContain('edit-label');
    expect(ids(items)).not.toContain('change-icon');
  });
});

describe('edge menu', () => {
  const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ edges: [e('x', { selected: true })] }));
  it('has edge actions', () => {
    for (const id of ['edit-label', 'lineType:orthogonal', 'lineType:straight', 'lineType:curved', 'strokeStyle:solid', 'strokeStyle:dashed', 'strokeStyle:dotted',
      'arrows:none', 'arrows:start', 'arrows:end', 'arrows:both', 'reverse-edge', 'copy-style', 'delete'])
      expect(ids(items), id).toContain(id);
    expect(ids(items).some((i) => i.startsWith('color:'))).toBe(true);
    expect(ids(items)).not.toContain('paste');
    expect(items[items.length - 1].id).toBe('delete');
  });
});

describe('multi-selection menu', () => {
  const two = ctx({ nodes: [n('a', { selected: true }), n('b', { selected: true })] });
  const items = getMenuItems({ type: 'node', id: 'a' }, two);
  it('has align/distribute/group; no edit-label', () => {
    for (const id of ['cut', 'copy', 'duplicate', 'align:left', 'align:center', 'align:right', 'align:top', 'align:middle', 'align:bottom', 'distribute:horizontal', 'distribute:vertical', 'group', 'lock', 'delete'])
      expect(ids(items), id).toContain(id);
    expect(ids(items)).not.toContain('edit-label');
  });
  it('distribute needs three nodes', () => {
    expect(find(items, 'distribute:horizontal')!.disabled).toBe(true);
    const three = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: ['a', 'b', 'c'].map((i) => n(i, { selected: true })) }));
    expect(find(three, 'distribute:horizontal')!.disabled).toBeFalsy();
    expect(find(three, 'align:left')!.disabled).toBeFalsy();
  });
});

describe('pane menu', () => {
  it('has canvas actions; paste-here disabled without clipboard', () => {
    const items = getMenuItems({ type: 'pane' }, ctx());
    for (const id of ['paste-here', 'add:rect', 'add:ellipse', 'add:diamond', 'add:text', 'add:sticky', 'add:group', 'select-all', 'zoom-fit', 'toggle-grid', 'toggle-snap', 'export-png', 'export-svg'])
      expect(ids(items), id).toContain(id);
    expect(find(items, 'paste-here')!.disabled).toBe(true);
    expect(find(getMenuItems({ type: 'pane' }, ctx({ hasClipboard: true })), 'paste-here')!.disabled).toBeFalsy();
  });
});

describe('tab and project menus', () => {
  it('tab', () => {
    const one = getMenuItems({ type: 'tab', id: 'p' }, ctx({ pageCount: 1 }));
    expect(ids(one)).toEqual(['rename-page', 'duplicate-page', 'delete-page']);
    expect(find(one, 'delete-page')!.disabled).toBe(true);
    expect(find(getMenuItems({ type: 'tab', id: 'p' }, ctx({ pageCount: 2 })), 'delete-page')!.disabled).toBeFalsy();
  });
  it('project', () => {
    const items = getMenuItems({ type: 'project', id: 'p' }, ctx());
    expect(ids(items)).toEqual(['project.open', 'project.rename', 'project.duplicate', 'project.export', 'project.delete']);
    expect(items[items.length - 1].danger).toBe(true);
  });
});

describe('cluster menu items', () => {
  const cl = (extra: Partial<DiagramNode['data']> = {}): DiagramNode => ({ id: 'C', type: 'cluster', position: { x: 0, y: 0 }, selected: true, data: { label: 'K', ...extra } });
  it('node: Set role submenu (all roles + none + custom) and Wrap selection in cluster', () => {
    const items = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [n('a', { selected: true })] }));
    const roles = items.find((i) => i.id === 'set-role')!;
    const ids = roles.children!.map((c) => c.id);
    for (const r of ['primary', 'replica', 'standby', 'leader', 'follower', 'arbiter', 'master', 'slave', 'shard', 'coordinator', 'data', 'ingest', 'controller', 'broker', 'sentinel', 'witness']) expect(ids).toContain(`role:${r}`);
    expect(ids).toContain('role:none');
    expect(ids).toContain('role-custom');
    expect(find(items, 'wrap-cluster')!.shortcut).toBe('⌥⌘G');
  });
  it('cluster: collapse/expand toggle, add replica, edit cluster only with a profile', () => {
    const plain = getMenuItems({ type: 'node', id: 'C' }, ctx({ nodes: [cl()] }));
    expect(find(plain, 'toggle-collapse')!.label).toBe('Collapse cluster');
    expect(find(plain, 'add-replica')).toBeDefined();
    expect(find(plain, 'edit-cluster')).toBeUndefined();
    const withProfile = getMenuItems({ type: 'node', id: 'C' }, ctx({ nodes: [cl({ profileId: 'kafka', collapsed: true })] }));
    expect(find(withProfile, 'edit-cluster')!.label).toBe('Edit cluster…');
    expect(find(withProfile, 'toggle-collapse')!.label).toBe('Expand cluster');
    expect(find(withProfile, 'ungroup')).toBeDefined();
  });
  it('edge: cluster edge kinds', () => {
    const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ edges: [e('x', { selected: true })] }));
    for (const k of ['replication', 'heartbeat', 'failover', 'sharding', 'none']) expect(ids(items)).toContain(`edgeKind:${k}`);
  });
  it('multi-selection can be wrapped in a cluster', () => {
    const items = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [n('a', { selected: true }), n('b', { selected: true })] }));
    expect(find(items, 'wrap-cluster')).toBeDefined();
  });
});

describe('Board menu items (phase 4)', () => {
  const sticky = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'sticky', position: { x: 0, y: 0 }, data: { label: id, fill: '#fff3a3' }, ...extra });
  it('the pane menu has a Board submenu with sticky, frame, mind map, frames, present, bring everyone and shortcuts', () => {
    const items = getMenuItems({ type: 'pane' }, ctx());
    const board = find(items, 'board')!;
    expect(board.children?.map((c) => c.id).filter((i) => !i.startsWith('sep'))).toEqual(['board-sticky', 'board-frame', 'board-mindmap', 'board-frames', 'board-present', 'board-summon', 'show-help']);
  });
  it('two or more selected stickies offer grid, colour grouping and framing', () => {
    const c = ctx({ nodes: [sticky('a', { selected: true }), sticky('b', { selected: true })] });
    const items = getMenuItems({ type: 'selection' }, c);
    for (const id of ['board-arrange:grid', 'board-arrange:color', 'board-frame']) expect(ids(items), id).toContain(id);
    expect(ids(getMenuItems({ type: 'selection' }, ctx({ nodes: [n('a', { selected: true }), n('b', { selected: true })] })))).not.toContain('board-arrange:grid');
  });
  it('a sticky has 8 colours; Reveal only shows for a private one', () => {
    const plain = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [sticky('a', { selected: true })] }));
    expect(find(plain, 'board-color')!.children).toHaveLength(8);
    expect(ids(plain)).not.toContain('board-reveal');
    const hidden = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [sticky('a', { selected: true, data: { label: 'a', private: true } })] }));
    expect(ids(hidden)).toContain('board-reveal');
  });
  it('a frame can be presented from, linked to and zoomed to', () => {
    const f: DiagramNode = { id: 'f', type: 'frame', position: { x: 0, y: 0 }, width: 400, height: 300, selected: true, data: { label: 'Intro' } };
    const items = getMenuItems({ type: 'node', id: 'f' }, ctx({ nodes: [f] }));
    for (const id of ['board-present', 'board-frame-link', 'board-zoom-frame', 'edit-label']) expect(ids(items), id).toContain(id);
    expect(ids(items)).not.toContain('change-icon');
  });
  it('a mind map node can grow, fold, tidy and export', () => {
    const m: DiagramNode = { id: 'm', type: 'mindmap', position: { x: 0, y: 0 }, selected: true, data: { label: 'Idea' } };
    const items = getMenuItems({ type: 'node', id: 'm' }, ctx({ nodes: [m] }));
    for (const id of ['board-mm-child', 'board-mm-sibling', 'board-mm-collapse', 'board-mm-layout', 'board-mm-export']) expect(ids(items), id).toContain(id);
  });
});
