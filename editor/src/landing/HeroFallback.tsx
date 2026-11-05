import { IconGlyph } from '../components/IconGlyph';

/** Same idea as the WebGL hero ("living architecture": logo nodes, connectors, packets), as animated SVG + CSS. Used without WebGL. */
const NODES: { id: string; label: string; x: number; y: number }[] = [
  { id: 'kafka', label: 'Kafka', x: 330, y: 250 }, { id: 'postgresql', label: 'PostgreSQL', x: 590, y: 130 }, { id: 'redis', label: 'Redis', x: 610, y: 370 }, { id: 'kubernetes', label: 'Kubernetes', x: 120, y: 130 },
  { id: 'prometheus', label: 'Prometheus', x: 110, y: 380 }, { id: 'grafana', label: 'Grafana', x: 330, y: 470 }, { id: 'nginx', label: 'nginx', x: 330, y: 50 },
];
const EDGES: { d: string; c: string; from: number; to: number }[] = [
  { d: 'M330 250 H590 V130', c: 'var(--hero-logs)', from: 0, to: 1 },
  { d: 'M330 250 H610 V370', c: 'var(--hero-logs)', from: 0, to: 2 },
  { d: 'M120 130 V250 H330', c: 'var(--hero-traces)', from: 3, to: 0 },
  { d: 'M110 380 H330 V470', c: 'var(--hero-metrics)', from: 4, to: 5 },
  { d: 'M330 50 H120 V130', c: 'var(--hero-traces)', from: 6, to: 3 },
];

export function HeroFallback({ className = '' }: { className?: string }) {
  return (
    <svg className={`hero-fallback ${className}`} viewBox="0 0 740 560" role="img" aria-label="Animated system architecture diagram" data-testid="hero-fallback" preserveAspectRatio="xMidYMid meet">
      <g fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {EDGES.map((e, i) => (
          <g key={i}>
            <path d={e.d} stroke={e.c} opacity=".35" transform="translate(30 30)" />
            <path className="hero-flow" d={e.d} stroke={e.c} strokeDasharray="3 14" transform="translate(30 30)" style={{ animationDelay: `${-i * 0.7}s` }} />
          </g>
        ))}
      </g>
      {EDGES.map((e, i) => (
        <circle key={`p${i}`} r="4.5" fill={e.c} className="hero-packet" transform="translate(30 30)">
          <animateMotion dur={`${3.2 + i * 0.6}s`} repeatCount="indefinite" path={e.d} begin={`${-i}s`} />
        </circle>
      ))}
      {NODES.map((n, i) => (
        <g key={n.id} className="hero-node" style={{ animationDelay: `${-i * 0.9}s` }}>
          <rect x={n.x} y={n.y} width="60" height="60" rx="16" className="hero-node-box" />
          <foreignObject x={n.x + 10} y={n.y + 10} width="40" height="40">
            <div className="hero-node-logo"><IconGlyph iconId={n.id} size={34} /></div>
          </foreignObject>
          <text className="hero-label" x={n.x + 30} y={n.y + 78} textAnchor="middle">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
