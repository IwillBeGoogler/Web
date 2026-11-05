/** Dev mode (read-only inspect): properties of a node and copyable snippets in several formats. Pure. */
import type { DiagramEdge, DiagramNode } from '../../types';
import { absolutePosition, nodeSize } from '../graph';
import { diagramToSchema } from '../er/convert';
import { renderSql } from '../er/renderSql';
import { renderMermaid as erMermaid } from '../er/mermaid';
import { diagramToModel } from '../uml/convert';
import { renderMermaid as umlMermaid } from '../uml/mermaid';
import { renderPlantUml } from '../uml/plantuml';
import { renderJava, renderTypeScript } from '../uml/skeleton';
import { renderSeqMermaid } from '../seq/mermaid';
import { renderSeqPlantUml } from '../seq/plantuml';
import { sequenceOf } from '../seq/node';
import { diagramToStateModel } from '../state/convert';
import { renderStateMermaid } from '../state/mermaid';

export interface Snippet { id: 'json' | 'svg' | 'ddl' | 'mermaid' | 'plantuml' | 'ts' | 'java'; label: string; code: string }
export interface InspectProps {
  kind: string;
  label: string;
  geometry: { x: number; y: number; width: number; height: number };
  colors: { fill?: string; stroke?: string; text?: string };
  font: { size?: number; bold?: boolean; align?: string };
}

export function inspectProps(n: DiagramNode, nodes: DiagramNode[]): InspectProps {
  const p = absolutePosition(nodes, n);
  const s = nodeSize(n);
  const d = n.data;
  return {
    kind: n.type ?? 'icon',
    label: String(d.label ?? ''),
    geometry: { x: p.x, y: p.y, width: s.width, height: s.height },
    colors: { fill: d.fill, stroke: d.stroke, text: d.textColor },
    font: { size: d.fontSize, bold: d.bold, align: d.align },
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function svgOf(n: DiagramNode, nodes: DiagramNode[]): string {
  const { geometry: g, colors: c, font } = inspectProps(n, nodes);
  const r = typeof n.data.radius === 'number' ? n.data.radius : 8;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">`,
    `  <rect x="1" y="1" width="${g.width - 2}" height="${g.height - 2}" rx="${r}" fill="${esc(c.fill ?? '#ffffff')}" stroke="${esc(c.stroke ?? '#2d3340')}" stroke-width="${n.data.strokeWidth ?? 1.5}"/>`,
    `  <text x="${g.width / 2}" y="${g.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${font.size ?? 14}"${font.bold ? ' font-weight="700"' : ''} fill="${esc(c.text ?? '#111111')}">${esc(String(n.data.label ?? ''))}</text>`,
    '</svg>',
  ].join('\n');
}

const TRANSIENT = new Set(['selected', 'dragging', 'measured', 'resizing']);

/** snippets that make sense for this node (databases, code and diagram text for ER / UML nodes, always JSON and SVG) */
export function snippetsFor(n: DiagramNode, nodes: DiagramNode[], edges: DiagramEdge[]): Snippet[] {
  const out: Snippet[] = [];
  if (n.type === 'table') {
    const schema = diagramToSchema([n], edges.filter((e) => e.source === n.id && e.target === n.id));
    out.push({ id: 'ddl', label: 'SQL (DDL)', code: renderSql(schema, 'postgres') });
    out.push({ id: 'mermaid', label: 'Mermaid', code: erMermaid(schema) });
  } else if (n.type === 'class') {
    const model = diagramToModel([n], []);
    out.push({ id: 'mermaid', label: 'Mermaid', code: umlMermaid(model) });
    out.push({ id: 'plantuml', label: 'PlantUML', code: renderPlantUml(model) });
    out.push({ id: 'ts', label: 'TypeScript', code: renderTypeScript(model) });
    out.push({ id: 'java', label: 'Java', code: renderJava(model) });
  } else if (n.type === 'sequence') {
    const model = sequenceOf(n) as unknown as Parameters<typeof renderSeqMermaid>[0];
    out.push({ id: 'mermaid', label: 'Mermaid', code: renderSeqMermaid(model) });
    out.push({ id: 'plantuml', label: 'PlantUML', code: renderSeqPlantUml(model) });
  } else if (n.type === 'state') {
    out.push({ id: 'mermaid', label: 'Mermaid', code: renderStateMermaid(diagramToStateModel([n], [])) });
  }
  const clean = Object.fromEntries(Object.entries(n).filter(([k, v]) => !TRANSIENT.has(k) && v !== undefined));
  out.push({ id: 'json', label: 'JSON', code: JSON.stringify(clean, null, 2) });
  out.push({ id: 'svg', label: 'SVG', code: svgOf(n, nodes) });
  return out;
}

/** `data.source` as a link: http(s) URLs are clickable, anything else (path:line) is just text */
export function sourceLinkOf(n: DiagramNode): { label: string; href?: string } | null {
  const s = n.data.source;
  if (typeof s !== 'string' || !s.trim()) return null;
  return /^https?:\/\//i.test(s) ? { label: s, href: s } : { label: s };
}
