import { useMemo } from 'react';
import { IconGlyph } from '../components/IconGlyph';
import { absolutePosition, isContainer, nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { resolveEdgeStyle, resolveSettings } from '../lib/settings';
import { monitoringStack } from '../templates/monitoringStack';

/** Read-only miniature canvas of the Monitoring template: real routing, animated flow dashes on every edge. */
export function MiniDemo() {
  const demo = useMemo(() => {
    const d = monitoringStack();
    const s = resolveSettings(undefined, undefined);
    const routes = computeRoutes(d.nodes, d.edges, { ...DEFAULT_ROUTING, edgeDefaults: s.edge, nodeDefaults: s.node });
    const boxes = d.nodes.filter((n) => !n.hidden).map((n) => ({ n, p: absolutePosition(d.nodes, n), sz: nodeSize(n) }));
    const minX = Math.min(...boxes.map((b) => b.p.x)) - 24;
    const minY = Math.min(...boxes.map((b) => b.p.y)) - 24;
    const maxX = Math.max(...boxes.map((b) => b.p.x + b.sz.width)) + 24;
    const maxY = Math.max(...boxes.map((b) => b.p.y + b.sz.height)) + 24;
    const edges = d.edges.flatMap((e) => {
      const r = routes.get(e.id);
      if (!r) return [];
      const st = resolveEdgeStyle(e.data ?? {}, { edge: s.edge });
      return [{ id: e.id, color: st.color.toLowerCase() === s.edge.color.toLowerCase() ? 'var(--demo-edge)' : st.color, d: r.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') }];
    });
    return { boxes, edges, vb: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` };
  }, []);
  return (
    <section className="l-section" aria-labelledby="demo-h">
      <h2 id="demo-h">See it flow</h2>
      <p className="l-section-sub">A live, read-only slice of the Monitoring template. Same routing and icons as the editor.</p>
      <div className="l-demo" role="img" aria-label="Monitoring stack diagram with animated data flow" data-testid="mini-demo">
        <svg viewBox={demo.vb} preserveAspectRatio="xMidYMid meet">
          {demo.boxes.filter((b) => isContainer(b.n)).map((b) => (
            <g key={b.n.id}>
              <rect x={b.p.x} y={b.p.y} width={b.sz.width} height={b.sz.height} rx="14" className="demo-group" />
              <text x={b.p.x + 12} y={b.p.y + 20} className="demo-group-label">{String(b.n.data.label)}</text>
            </g>
          ))}
          {demo.edges.map((e) => (
            <g key={e.id} fill="none" stroke={e.color} strokeWidth="2" strokeLinejoin="round">
              <path d={e.d} opacity=".28" />
              <path d={e.d} className="demo-flow" strokeDasharray="6 10" />
            </g>
          ))}
          {demo.boxes.filter((b) => b.n.type === 'icon').map((b) => (
            <foreignObject key={b.n.id} x={b.p.x} y={b.p.y} width={b.sz.width} height={b.sz.height}>
              <div className="demo-node"><span className="demo-icon"><IconGlyph iconId={b.n.data.iconId} size={44} /></span><span>{String(b.n.data.label)}</span></div>
            </foreignObject>
          ))}
        </svg>
      </div>
    </section>
  );
}
