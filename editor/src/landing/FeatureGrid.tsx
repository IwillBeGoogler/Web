import { Command, FileText, Layers, Network, Palette, Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface Feature { id: string; title: string; text: string; icon: ReactNode; anim: ReactNode }

const dots = (n: number) => Array.from({ length: n }, (_, i) => <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />);

const FEATURES: Feature[] = [
  { id: 'icons', title: '2,000+ real icons', text: 'AWS, GCP, Azure, Kubernetes, CNCF and hundreds of tools with their real logos. Search by name, alias or #tag.', icon: <Search size={18} aria-hidden />,
    anim: <div className="fa fa-icons" aria-hidden>{dots(9)}</div> },
  { id: 'clusters', title: 'Cluster wizard', text: 'Kafka, PostgreSQL, Redis, Kubernetes and 80 more: pick sizes and AZs, get a validated, laid-out cluster with ports and roles.', icon: <Layers size={18} aria-hidden />,
    anim: <div className="fa fa-cluster" aria-hidden><i /><i /><i /><b /></div> },
  { id: 'routing', title: 'Smart routing', text: 'Orthogonal lines avoid nodes, same-style edges bundle onto shared tracks and parallel lines keep their distance.', icon: <Network size={18} aria-hidden />,
    anim: <svg className="fa fa-route" viewBox="0 0 120 50" aria-hidden><path d="M4 10 H50 V40 H116" /><path d="M4 25 H50 V40 H116" /><path className="b" d="M4 40 H116" /></svg> },
  { id: 'files', title: 'Pages and .sdd files', text: 'Multi-page projects saved in your browser; export a portable .sdd file with images and settings inside.', icon: <FileText size={18} aria-hidden />,
    anim: <div className="fa fa-pages" aria-hidden><i /><i /><i /></div> },
  { id: 'style', title: 'Bulk styling and presets', text: 'Select many things and restyle them at once. Edge presets for metrics, logs and traces keep diagrams consistent.', icon: <Palette size={18} aria-hidden />,
    anim: <div className="fa fa-style" aria-hidden><i /><i /><i /></div> },
  { id: 'palette', title: '⌘K command palette', text: 'Every action, template and icon one keystroke away. Keyboard-first, with shortcuts for everything else.', icon: <Command size={18} aria-hidden />,
    anim: <div className="fa fa-cmd" aria-hidden><span>⌘K</span><i /></div> },
];

export function FeatureGrid() {
  return (
    <section id="features" className="l-section" aria-labelledby="feat-h">
      <h2 id="feat-h">Everything a system diagram needs</h2>
      <p className="l-section-sub">Fast to draw, easy to keep tidy, yours to keep.</p>
      <ul className="l-features">
        {FEATURES.map((f) => (
          <li key={f.id} id={f.id === 'clusters' ? 'clusters' : undefined} className="l-feature" data-testid="feature-card">
            <div className="l-feature-anim">{f.anim}</div>
            <h3>{f.icon}{f.title}</h3>
            <p>{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
