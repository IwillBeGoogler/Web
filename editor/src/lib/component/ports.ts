import type { ComponentData, ComponentPort, PortSide } from '../uml2/types';

export const PORT_R = 6;

/** Re-space the ports of every side evenly (offset = (i + 1) / (n + 1)), keeping their order. */
export function spreadPorts(ports: ComponentPort[]): ComponentPort[] {
  const count: Record<string, number> = {};
  for (const p of ports) count[p.side] = (count[p.side] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return ports.map((p) => {
    const i = seen[p.side] = (seen[p.side] ?? -1) + 1;
    return { ...p, offset: (i + 1) / (count[p.side] + 1) };
  });
}

/** Position of a port on the border of a box of the given size, relative to the box's top left corner. */
export function portOffsetPoint(w: number, h: number, p: Pick<ComponentPort, 'side' | 'offset'>): { x: number; y: number } {
  const t = p.offset ?? 0.5;
  switch (p.side) {
    case 'left': return { x: 0, y: h * t };
    case 'right': return { x: w, y: h * t };
    case 'top': return { x: w * t, y: 0 };
    default: return { x: w * t, y: h };
  }
}

export const portsOf = (d: { ports?: ComponentPort[] } | undefined): ComponentPort[] => d?.ports ?? [];
export const portById = (d: { ports?: ComponentPort[] } | undefined, id: string | undefined): ComponentPort | undefined => (id ? portsOf(d).find((p) => p.id === id) : undefined);

/** Add an interface port to a component (provided on the left, required on the right unless a side is given). */
export function addPort(d: ComponentData, kind: 'provided' | 'required', name?: string, side?: PortSide): ComponentData {
  const ports = portsOf(d);
  let n = ports.length + 1;
  while (ports.some((p) => p.id === `p${n}`)) n++;
  const port: ComponentPort = { id: `p${n}`, name: name ?? (kind === 'provided' ? 'IProvided' : 'IRequired'), kind, side: side ?? (kind === 'provided' ? 'left' : 'right') };
  return { ...d, ports: spreadPorts([...ports, port]) };
}

export function removePort(d: ComponentData, id: string): ComponentData {
  const rest = portsOf(d).filter((p) => p.id !== id);
  const { ports: _p, ...others } = d;
  return rest.length ? { ...others, ports: spreadPorts(rest) } : others;
}

export function updatePort(d: ComponentData, id: string, patch: Partial<Omit<ComponentPort, 'id'>>): ComponentData {
  return { ...d, ports: spreadPorts(portsOf(d).map((p) => (p.id === id ? { ...p, ...patch } : p))) };
}
