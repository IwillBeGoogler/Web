import type { UmlRelDef } from './model';
import type { UmlRelKind } from './types';

/** the pattern of a Mermaid / PlantUML relation line: A ["m"] ARROW ["m"] B [: label] */
export const REL_LINE = /^("[^"]+"|[\w.$~<>,]+)\s+(?:"([^"]*)"\s+)?([<*o|^#+x}{]*(?:-|\.|=)+(?:\[[^\]]*\])?[a-z]*(?:-|\.|=)*[>*o|^#+x}{]*)\s+(?:"([^"]*)"\s+)?("[^"]+"|[\w.$~<>,]+)(?:\s*:\s*(.*))?$/;

const unq = (s: string) => s.replace(/^"|"$/g, '');

/** "-up->" / "-[#red]->" -> "-->" */
const normalize = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/([-.=])[a-z]+([-.=])/gi, '$1$2');

/**
 * Read an arrow token. Heads: `<|` / `|>` hollow triangle (inheritance, or realization on a dotted line), `*` filled diamond,
 * `o` hollow diamond, `<` / `>` open arrow. The result is in the drawn direction (from = subclass / part / dependent).
 */
export function parseArrow(token: string, a: string, b: string, aMult?: string, bMult?: string): UmlRelDef | null {
  const t = normalize(token);
  const m = /^(<\||<|\*|o)?(-+|\.+|=+)(\|>|>|\*|o)?$/.exec(t);
  if (!m) return null;
  const [, lh, line, rh] = m;
  const dotted = line[0] === '.';
  // head on the left operand A / on the right operand B
  const head = (h: string | undefined) => h === '<|' || h === '|>' ? 'tri' : h === '*' ? 'comp' : h === 'o' ? 'agg' : h === '<' || h === '>' ? 'arrow' : '';
  const L = head(lh);
  const R = head(rh);
  const mk = (from: string, to: string, kind: UmlRelKind, fromMult?: string, toMult?: string, directed?: boolean): UmlRelDef => ({
    from, to, kind, ...(directed ? { directed: true } : {}),
    ...(fromMult ? { fromMult: unq(fromMult) } : {}), ...(toMult ? { toMult: unq(toMult) } : {}),
  });
  if (L === 'tri') return mk(b, a, dotted ? 'realization' : 'inheritance', bMult, aMult);
  if (R === 'tri') return mk(a, b, dotted ? 'realization' : 'inheritance', aMult, bMult);
  if (L === 'comp') return mk(b, a, 'composition', bMult, aMult);
  if (R === 'comp') return mk(a, b, 'composition', aMult, bMult);
  if (L === 'agg') return mk(b, a, 'aggregation', bMult, aMult);
  if (R === 'agg') return mk(a, b, 'aggregation', aMult, bMult);
  if (L === 'arrow') return mk(b, a, dotted ? 'dependency' : 'association', bMult, aMult, !dotted);
  if (R === 'arrow') return mk(a, b, dotted ? 'dependency' : 'association', aMult, bMult, !dotted);
  return mk(a, b, dotted ? 'dependency' : 'association', aMult, bMult);
}

/** Parse a whole relation line; null when it is not one. */
export function parseRelationLine(line: string): UmlRelDef | null {
  const m = REL_LINE.exec(line.trim());
  if (!m) return null;
  const r = parseArrow(m[3], unq(m[1]), unq(m[5]), m[2], m[4]);
  if (!r) return null;
  const label = (m[6] ?? '').trim();
  return label ? { ...r, label } : r;
}

/** Render a relation as `A "m" ARROW "m" B : label`; the arrow style follows the kind. `style` picks the realization spelling. */
export function relationLine(r: UmlRelDef): string {
  const q = (m?: string) => (m ? ` "${m}"` : '');
  const label = r.label ? ` : ${r.label}` : '';
  switch (r.kind) {
    case 'inheritance': return `${r.to}${q(r.toMult)} <|--${q(r.fromMult)} ${r.from}${label}`;
    case 'realization': return `${r.to}${q(r.toMult)} <|..${q(r.fromMult)} ${r.from}${label}`;
    case 'composition': return `${r.to}${q(r.toMult)} *--${q(r.fromMult)} ${r.from}${label}`;
    case 'aggregation': return `${r.to}${q(r.toMult)} o--${q(r.fromMult)} ${r.from}${label}`;
    case 'dependency': return `${r.from}${q(r.fromMult)} ..>${q(r.toMult)} ${r.to}${label}`;
    default: return `${r.from}${q(r.fromMult)} ${r.directed ? '-->' : '--'}${q(r.toMult)} ${r.to}${label}`;
  }
}
