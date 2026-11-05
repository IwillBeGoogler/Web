import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './templates';
import { computeRoutes, DEFAULT_ROUTING } from './lib/routing';
import { labelBox } from './lib/routing/labels';
import { endLabels } from './lib/uml/labels';
import { BUILTIN_SETTINGS } from './lib/settings';
import { absolutePosition, nodeSize } from './lib/graph';
import { lintPage } from '../core/lint';
import { Uml2Glyph } from './components/uml/Uml2Glyph';
import { useDiagramStore } from './store/diagramStore';
import { useUiStore } from './store/uiStore';
import { executeAction } from './lib/actions';
import { classOf } from './lib/uml/geometry';
import { PALETTE_MODES } from './data/diagramModes';
import { dictionaries } from './i18n/dict';
import { localeTag, setLang } from './i18n';
import type { DiagramNode } from './types';

const tpl = (id: string) => ALL_TEMPLATES.find((t) => t.id === id)!;
const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };
const hit = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('lint: architecture rules never fire on UML nodes', () => {
  it('no arch/* problem on any UML template', () => {
    for (const t of ALL_TEMPLATES.filter((x) => x.tags?.includes('uml'))) {
      const d = t.build();
      const problems = lintPage({ id: 'p', name: t.name, nodes: d.nodes as never, edges: d.edges as never }).filter((p) => p.rule.startsWith('arch/'));
      expect(problems.map((p) => `${t.id}: ${p.message}`)).toEqual([]);
    }
  });
  it('a deployment node labelled like a database is not a database', () => {
    const d = tpl('deployment-web-shop').build();
    const ps = lintPage({ id: 'p', name: 'd', nodes: d.nodes as never, edges: d.edges as never });
    expect(ps.some((p) => /replica|backup|monitoring/i.test(p.message))).toBe(false);
  });
});

describe('palette glyphs', () => {
  it('Timing frame, Timing lifeline and Communication object are drawn', () => {
    for (const id of ['uml-timing', 'uml-timing-lifeline', 'uml-comm-object']) expect(Uml2Glyph({ id }), id).not.toBeNull();
  });
});

describe('template edge labels keep clear of arrowheads, multiplicities and node borders', () => {
  for (const id of ['uml-observer', 'object-order-snapshot', 'uml-strategy', 'uml-decorator']) {
    it(id, () => {
      const d = tpl(id).build();
      const routes = computeRoutes(d.nodes, d.edges, opts);
      const rects = d.nodes.filter((n) => n.type !== 'group' && n.type !== 'text' && n.type !== 'sticky').map((n) => ({ ...absolutePosition(d.nodes, n), ...nodeSize(n) }));
      const bad: string[] = [];
      for (const e of d.edges) {
        const text = typeof e.label === 'string' ? e.label : '';
        const r = routes.get(e.id);
        if (!text || !r) continue;
        const box = labelBox(r.labelPt, text);
        if (rects.some((n) => hit(box, n))) bad.push(`${e.id}: on a node`);
        for (const other of d.edges) {
          const o = routes.get(other.id);
          const uml = other.data?.uml;
          if (!o || !uml) continue;
          for (const l of endLabels(o.points, uml, { startCut: o.startCut, endCut: o.endCut })) {
            const w = Math.min(120, l.text.length * 6.5 + 8);
            const lb = { x: l.anchor === 'center' ? l.x - w / 2 : l.anchor === 'end' ? l.x - w : l.x, y: l.y - 8, width: w, height: 16 };
            if (hit(box, lb)) bad.push(`${e.id}: on the ${l.kind} "${l.text}" of ${other.id}`);
          }
        }
      }
      expect(bad).toEqual([]);
    });
  }
});

describe('Tidy re-centres edge labels', () => {
  beforeEach(() => useDiagramStore.setState({ nodes: [], edges: [] }));
  it('forgets labelT / labelOffset / bends of the edges of moved classes', () => {
    const d = tpl('uml-observer').build();
    const edge = d.edges.find((e) => e.data?.uml)!;
    const edges = d.edges.map((e) => (e.id === edge.id ? { ...e, data: { ...e.data, labelT: 0.9, labelOffset: 40, manual: true, waypoints: [{ x: 1, y: 1 }] } } : e));
    useDiagramStore.setState({ nodes: d.nodes.map((n) => (n.id === edge.source ? { ...n, position: { x: n.position.x + 333, y: n.position.y + 777 } } : n)) as DiagramNode[], edges: edges as never });
    useDiagramStore.getState().tidyUml();
    const after = useDiagramStore.getState().edges.find((e) => e.id === edge.id)!;
    expect(after.data?.labelT).toBeUndefined();
    expect(after.data?.labelOffset).toBeUndefined();
    expect(after.data?.waypoints).toBeUndefined();
  });
});

describe('package template and export', () => {
  it('classes carry realistic members, not the placeholders of a new class', () => {
    const d = tpl('package-layered-shop').build();
    const classes = d.nodes.filter((n) => n.type === 'class');
    expect(classes.length).toBe(5);
    for (const c of classes) {
      const cd = classOf(c);
      const names = [...cd.attributes, ...cd.operations].map((m) => m.name);
      expect(names, String(c.data.label)).not.toContain('attribute');
      expect(names, String(c.data.label)).not.toContain('operation');
      expect(names.length).toBeGreaterThan(0);
    }
  });
});

describe('insertContent selection', () => {
  it('select: false leaves the new items unselected, the default keeps them selected', () => {
    const d = tpl('uml-observer').build();
    useDiagramStore.setState({ nodes: [], edges: [] });
    useDiagramStore.getState().insertContent(d, { select: false });
    expect(useDiagramStore.getState().nodes.some((n) => n.selected)).toBe(false);
    expect(useDiagramStore.getState().edges.some((e) => e.selected)).toBe(false);
  });
});

describe('context menu "Add attribute"', () => {
  it('asks the class node to open the new member for inline editing', () => {
    const d = tpl('uml-observer').build();
    useDiagramStore.setState({ nodes: d.nodes as never, edges: d.edges as never });
    const cls = d.nodes.find((n) => n.type === 'class')!;
    useUiStore.getState().setMemberEdit(null);
    executeAction('class-add-attribute', { nodeId: cls.id });
    const req = useUiStore.getState().memberEdit;
    expect(req?.nodeId).toBe(cls.id);
    const added = classOf(useDiagramStore.getState().nodes.find((n) => n.id === cls.id)!).attributes.at(-1)!;
    expect(req?.memberId).toBe(added.id);
  });
});

describe('uz / ru: templates, palette hints, locale', () => {
  it('has every template name, palette hint and alignment label', () => {
    const keys = [...ALL_TEMPLATES.map((t) => t.name), ...PALETTE_MODES.map((m) => m.hint), 'Align left', 'Align bottom', 'selected. Changes apply to every item they make sense for.', 'Arranged {n} classes', 'Arranged {n} class'];
    for (const lang of ['uz', 'ru'] as const) expect(keys.filter((k) => !(k in dictionaries[lang]) ), lang).toEqual([]);
  });
  it('formats dates with the UI language', () => {
    setLang('uz');
    expect(localeTag()).toBe('uz-UZ');
    setLang('ru');
    expect(localeTag()).toBe('ru-RU');
    setLang('en');
    expect(localeTag()).toBe('en');
  });
});
