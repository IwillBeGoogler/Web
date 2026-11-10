import { describe, expect, it } from 'vitest';
import type { ComponentData } from '../uml2/types';
import { addPort, portById, portOffsetPoint, portsOf, removePort, updatePort } from './ports';

const base: ComponentData = { label: 'A', compKind: 'component', accent: '#000' };

describe('ports extras', () => {
  it('portOffsetPoint for top, bottom and default offset', () => {
    expect(portOffsetPoint(100, 60, { side: 'top', offset: 0.5 })).toEqual({ x: 50, y: 0 });
    expect(portOffsetPoint(100, 60, { side: 'bottom', offset: 0.25 })).toEqual({ x: 25, y: 60 });
    expect(portOffsetPoint(100, 60, { side: 'left' })).toEqual({ x: 0, y: 30 });
  });
  it('portsOf / portById tolerate undefined', () => {
    expect(portsOf(undefined)).toEqual([]);
    expect(portsOf({})).toEqual([]);
    expect(portById(undefined, 'p1')).toBeUndefined();
    expect(portById({ ports: [{ id: 'p1', name: 'x', kind: 'provided', side: 'left' }] }, undefined)).toBeUndefined();
    expect(portById({ ports: [{ id: 'p1', name: 'x', kind: 'provided', side: 'left' }] }, 'p1')?.name).toBe('x');
    expect(portById({ ports: [] }, 'nope')).toBeUndefined();
  });
  it('addPort defaults names/sides, avoids id collisions and honours explicit side', () => {
    let d = addPort(base, 'provided');
    expect(d.ports![0]).toMatchObject({ id: 'p1', name: 'IProvided', side: 'left' });
    d = addPort(d, 'required');
    expect(d.ports![1]).toMatchObject({ id: 'p2', name: 'IRequired', side: 'right' });
    d = addPort({ ...d, ports: [{ id: 'p3', name: 'z', kind: 'provided', side: 'top' }] }, 'required', 'Q', 'bottom');
    expect(d.ports!.map((p) => p.id)).toEqual(['p3', 'p2']);
    expect(d.ports![1]).toMatchObject({ name: 'Q', side: 'bottom' });
  });
  it('removePort drops the key when empty; updatePort patches only target', () => {
    const d = addPort(base, 'provided', 'X');
    const r = removePort(d, 'p1');
    expect('ports' in r).toBe(false);
    const u = updatePort(addPort(d, 'required', 'Y'), 'p2', { name: 'Z' });
    expect(u.ports!.map((p) => p.name)).toEqual(['X', 'Z']);
  });
});
