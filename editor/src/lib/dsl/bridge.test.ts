import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyText, storeText } from './bridge';

const s = () => useDiagramStore.getState();
beforeEach(() => s().reset());

const TEXT = `#!sdd 1
diagram "Shop"

group vpc "VPC" icon=aws-group-aws-cloud {
  node api "API" icon=service
}
node web "Web" icon=browser

web -> api "HTTPS"
`;

describe('text -> canvas', () => {
  it('creates nodes and edges (styled for React Flow) in one undo step', () => {
    const r = applyText(TEXT);
    expect(r.applied).toBe(true);
    expect(s().nodes.map((n) => n.id).sort()).toEqual(['api', 'vpc', 'web']);
    const api = s().nodes.find((n) => n.id === 'api')!;
    expect(api.parentId).toBe('vpc');
    expect(s().nodes.findIndex((n) => n.id === 'vpc')).toBeLessThan(s().nodes.findIndex((n) => n.id === 'api'));
    expect(s().edges[0]).toMatchObject({ source: 'web', target: 'api', label: 'HTTPS', style: expect.any(Object) });
    s().undo();
    expect(s().nodes).toHaveLength(0);
  });
  it('keeps positions and untouched node objects of existing ids; moving a node on the canvas is not a text change', () => {
    applyText(TEXT);
    s().setNodePosition('web', { x: 1234, y: 567 });
    const before = s().nodes.find((n) => n.id === 'web')!;
    const text = storeText();
    expect(applyText(text).applied).toBe(false);
    const r = applyText(TEXT.replace('"Web"', '"Web app"'));
    expect(r.applied).toBe(true);
    const web = s().nodes.find((n) => n.id === 'web')!;
    expect(web.position).toEqual({ x: 1234, y: 567 });
    expect(web.data.label).toBe('Web app');
    expect(web).not.toBe(before);
    expect(s().nodes.find((n) => n.id === 'vpc')).toBeTruthy();
  });
  it('syntax errors leave the canvas alone and are reported with line numbers', () => {
    applyText(TEXT);
    const before = s().nodes;
    const r = applyText(TEXT + 'garbage line\n');
    expect(r.applied).toBe(false);
    expect(r.diagnostics.find((d) => d.severity === 'error')).toMatchObject({ line: 10 });
    expect(s().nodes).toBe(before);
  });
  it('tables get sizes, sequences get sizes', () => {
    applyText(`#!sdd 1\ntable users {\n id uuid [pk]\n}\nseq s "S" {\n a -> b: hi\n}\n`);
    const t = s().nodes.find((n) => n.type === 'table')!;
    expect(t.width).toBeGreaterThan(100);
    expect((t.style as { width: number }).width).toBe(t.width);
    expect(s().nodes.find((n) => n.type === 'sequence')!.width).toBeGreaterThan(100);
  });
});

describe('canvas -> text', () => {
  it('prints the canvas deterministically and reflects edits', () => {
    applyText(TEXT);
    const t1 = storeText();
    expect(storeText()).toBe(t1);
    s().updateNodeData('web', { label: 'Frontend' });
    expect(storeText()).toContain('node web "Frontend" icon=browser');
    s().deleteNodes(['web']);
    expect(storeText()).not.toContain('web');
  });
  it('round trip: text -> canvas -> text is a fixed point', () => {
    applyText(TEXT);
    const t = storeText();
    s().reset();
    applyText(t);
    expect(storeText()).toBe(t);
  });
});
