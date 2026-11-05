import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyText } from './bridge';
import { DslSession } from './session';

const s = () => useDiagramStore.getState();
let ext: string[];
let diags: number[];
let session: DslSession;
beforeEach(() => {
  vi.useFakeTimers();
  s().reset();
  applyText('#!sdd 1\nnode a "A" icon=redis\nnode b "B"\na -> b\n');
  ext = [];
  diags = [];
  session = new DslSession({ onExternalText: (t) => ext.push(t), onDiagnostics: (d) => diags.push(d.length) });
});
afterEach(() => { session.stop(); vi.useRealTimers(); });

describe('DslSession', () => {
  it('starts with the canonical text of the canvas', () => {
    expect(session.start()).toContain('node a "A" icon=redis');
  });
  it('debounces text edits and applies them once', () => {
    session.start();
    session.edit('#!sdd 1\nnode a "A" icon=redis\nnode b "B"\nnode c "C"\na -> b\n');
    session.edit('#!sdd 1\nnode a "A" icon=redis\nnode b "B"\nnode c "C2"\na -> b\n');
    expect(s().nodes).toHaveLength(2);
    vi.advanceTimersByTime(300);
    expect(s().nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(s().nodes[2].data.label).toBe('C2');
    expect(ext).toEqual([]); // no echo back into the editor
  });
  it('syntax errors are reported and the canvas is untouched', () => {
    session.start();
    session.edit('#!sdd 1\nnode a "A"\noops\n');
    vi.advanceTimersByTime(300);
    expect(diags.at(-1)).toBeGreaterThan(0);
    expect(s().nodes).toHaveLength(2);
  });
  it('canvas edits push new text to the editor; moves and selection do not', () => {
    session.start();
    s().setNodePosition('a', { x: 50, y: 60 });
    s().selectOnly('node', 'b');
    expect(ext).toEqual([]);
    s().updateNodeData('a', { label: 'Alpha' });
    expect(ext).toHaveLength(1);
    expect(ext[0]).toContain('node a "Alpha"');
  });
  it('a canvas edit cancels unapplied typing (canvas wins)', () => {
    session.start();
    session.edit('#!sdd 1\nnode z "Z"\n');
    s().updateNodeData('b', { label: 'Bee' });
    vi.advanceTimersByTime(500);
    expect(s().nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });
  it('read-only sessions never write to the canvas', () => {
    const ro = new DslSession({ onExternalText: () => undefined, onDiagnostics: () => undefined, readOnly: () => true });
    ro.start();
    ro.edit('#!sdd 1\nnode z "Z"\n');
    ro.flush();
    expect(s().nodes).toHaveLength(2);
    ro.stop();
  });
});
