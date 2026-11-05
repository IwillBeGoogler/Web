import type { Pt } from '../routing/geometry';
import type { UmlRelationData } from './types';

export interface EndLabel {
  text: string;
  x: number;
  y: number;
  end: 'source' | 'target';
  kind: 'mult' | 'role';
  /** which side of the line the label sits on: 'above' / 'left' = negative perpendicular offset */
  side: 'above' | 'below';
  /** horizontal anchor of the chip: starting / ending at x (it grows along a horizontal leg away from its node, or sideways from a vertical leg); `center` is kept for centred chips */
  anchor: 'center' | 'start' | 'end';
}

const ALONG = 12; // px from the end of the drawn line (past the marker) to the label centre
const PERP = 11; // px from the line to the label centre

/**
 * Where the multiplicity and role-name chips go: close to their end of the route, beside the first / last leg (never on
 * the line). The multiplicity sits above a horizontal leg / right of a vertical one, the role name on the other side.
 * `startCut` / `endCut` are the marker lengths at each end, so the label starts beyond the arrowhead or diamond.
 */
export function endLabels(points: Pt[], uml: Partial<UmlRelationData>, cuts: { startCut: number; endCut: number }): EndLabel[] {
  if (points.length < 2) return [];
  const out: EndLabel[] = [];
  const place = (end: 'source' | 'target', mult?: string, role?: string) => {
    const texts: [string, 'mult' | 'role'][] = [];
    if (mult?.trim()) texts.push([mult.trim(), 'mult']);
    if (role?.trim()) texts.push([role.trim(), 'role']);
    if (!texts.length) return;
    const a = end === 'source' ? points[0] : points[points.length - 1];
    const b = end === 'source' ? points[1] : points[points.length - 2];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const cut = end === 'source' ? cuts.startCut : cuts.endCut;
    // unit normal: for a horizontal leg "above" is -y, for a vertical leg the multiplicity goes to +x
    const horizontal = Math.abs(ux) >= Math.abs(uy);
    // stay on the leg: never beyond its middle. Beside a horizontal leg the chip starts just past the arrowhead and grows
    // along the leg (away from the node), so a wide role name never reaches over the marker or into the node
    const along = horizontal ? Math.min(cut + 8, len * 0.45) : Math.min(cut + ALONG, len * 0.6);
    const cx = a.x + ux * along;
    const cy = a.y + uy * along;
    const n = horizontal ? { x: 0, y: -1 } : { x: 1, y: 0 };
    for (const [text, kind] of texts) {
      const sgn = kind === 'mult' ? 1 : -1;
      const base = texts.length === 1 && kind === 'role' ? 1 : sgn;
      out.push({ text, end, kind, x: Math.round((cx + n.x * PERP * base) * 10) / 10, y: Math.round((cy + n.y * PERP * base) * 10) / 10, side: base > 0 ? 'above' : 'below', anchor: horizontal ? (ux >= 0 ? 'start' : 'end') : base > 0 ? 'start' : 'end' });
    }
  };
  place('source', uml.sourceMult, uml.sourceRole);
  place('target', uml.targetMult, uml.targetRole);
  return out;
}
