import { emptyUseCaseModel, type UcCase, type UcRelKind, type UseCaseModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');

/** use case diagram as PlantUML (actors left to right, system boundaries as `rectangle`) */
export function renderUseCasePlantuml(model: UseCaseModel): string {
  const id = new Map<string, string>();
  model.actors.forEach((a, i) => id.set(a.id, `A${i + 1}`));
  model.cases.forEach((c, i) => id.set(c.id, `U${i + 1}`));
  const lines = ['@startuml', 'left to right direction'];
  for (const a of model.actors) lines.push(`actor "${q(a.name)}" as ${id.get(a.id)}`);
  const usecase = (c: UcCase, pad: string) => {
    const desc = c.extensionPoints?.length ? `${q(c.name)}\\n--\\nextension points: ${c.extensionPoints.map(q).join(', ')}` : q(c.name);
    lines.push(`${pad}usecase "${desc}" as ${id.get(c.id)}`);
  };
  const bset = new Set(model.boundaries.map((b) => b.id));
  for (const b of model.boundaries) {
    lines.push(`rectangle "${q(b.name)}" {`);
    for (const c of model.cases) if (c.boundary === b.id) usecase(c, '  ');
    lines.push('}');
  }
  for (const c of model.cases) if (!c.boundary || !bset.has(c.boundary)) usecase(c, '');
  for (const r of model.relations) {
    const a = id.get(r.from), b = id.get(r.to);
    if (!a || !b) continue;
    const ends = (arrow: string) => `${a}${r.fromMult ? ` "${q(r.fromMult)}"` : ''} ${arrow}${r.toMult ? ` "${q(r.toMult)}"` : ''} ${b}`;
    const label = r.label ? ` : ${q(r.label)}` : '';
    if (r.kind === 'include') lines.push(`${ends('.>')} : <<include>>`);
    else if (r.kind === 'extend') lines.push(`${ends('.>')} : <<extend>>`);
    else if (r.kind === 'generalization') lines.push(`${ends('--|>')}${label}`);
    else lines.push(`${ends('--')}${label}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

export const looksLikeUseCasePlantuml = (text: string): boolean => {
  if (!/@startuml/i.test(text)) return false;
  if (/^\s*(participant|class|enum|interface|state|component|node|artifact|boundary|control|entity|alt|loop|opt|activate|autonumber)\b/im.test(text)) return false;
  return /^\s*usecase\b/im.test(text) || /[-.]+>?\s*\([^)\n]+\)|\([^)\n]+\)\s*<?[-.]+/.test(text);
};

const REF = '(:[^:\\n]+:|\\([^)\\n]+\\)|"[^"\\n]+"|\\w+)';
const ARROW = '((?:<\\|?|<)?[-.]+(?:\\w+[-.]*|\\[[^\\]]*\\][-.]*)?(?:\\|>|>)?)';
const LINK = new RegExp(`^${REF}\\s*(?:"([^"]*)"\\s*)?${ARROW}\\s*(?:"([^"]*)"\\s*)?${REF}\\s*(?::\\s*(.*))?$`);

/** Parse the use case subset of PlantUML: actor, usecase, (Name), :Actor:, rectangle / package blocks, associations, include / extend, generalization, multiplicities. */
export function parseUseCasePlantuml(text: string): { model: UseCaseModel; warnings: string[] } {
  const model = emptyUseCaseModel();
  const warnings: string[] = [];
  const byKey = new Map<string, { type: 'actor' | 'case'; id: string }>();
  let n = 0;
  const stack: (string | null)[] = [];
  const currentBoundary = () => [...stack].reverse().find((x) => x) ?? undefined;
  const addActor = (name: string, alias?: string) => {
    const hit = byKey.get(alias ?? name) ?? byKey.get(name);
    if (hit?.type === 'actor') return hit.id;
    const id = `a${++n}`;
    model.actors.push({ id, name });
    byKey.set(name, { type: 'actor', id });
    if (alias) byKey.set(alias, { type: 'actor', id });
    return id;
  };
  const addCase = (rawName: string, alias?: string) => {
    const hit = byKey.get(alias ?? rawName) ?? byKey.get(rawName);
    if (hit?.type === 'case') {
      const c = model.cases.find((x) => x.id === hit.id)!;
      if (!c.boundary && currentBoundary()) c.boundary = currentBoundary();
      return hit.id;
    }
    const parts = rawName.replace(/\\n/g, '\n').split('\n').map((s) => s.trim());
    const name = parts[0];
    const eps: string[] = [];
    for (const p of parts.slice(1)) {
      const m = p.match(/^extension points?\s*:?\s*(.*)$/i);
      if (m) eps.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
    }
    const id = `u${++n}`;
    const c: UcCase = { id, name, ...(eps.length ? { extensionPoints: eps } : {}), ...(currentBoundary() ? { boundary: currentBoundary() } : {}) };
    model.cases.push(c);
    byKey.set(name, { type: 'case', id });
    byKey.set(rawName, { type: 'case', id });
    if (alias) byKey.set(alias, { type: 'case', id });
    return id;
  };
  /** `"Name" as id`, `id as "Name"`, `(Name) as id`, `:Name: as id`, `Name` */
  const decl = (rest: string): { name: string; alias?: string } | undefined => {
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^"([^"]+)"\s+as\s+(\w+)/))) return { name: m[1], alias: m[2] };
    if ((m = rest.match(/^(\w+)\s+as\s+"([^"]+)"/))) return { name: m[2], alias: m[1] };
    if ((m = rest.match(/^\(([^)]+)\)(?:\s+as\s+(\w+))?/))) return { name: m[1], alias: m[2] };
    if ((m = rest.match(/^:([^:]+):(?:\s+as\s+(\w+))?/))) return { name: m[1], alias: m[2] };
    if ((m = rest.match(/^"([^"]+)"/))) return { name: m[1] };
    if ((m = rest.match(/^(\w+)(?:\s+as\s+(\w+))?/))) return { name: m[1] };
    return undefined;
  };
  const resolve = (ref: string): { type: 'actor' | 'case'; id: string } => {
    if (ref.startsWith('(')) return { type: 'case', id: addCase(ref.slice(1, -1)) };
    if (ref.startsWith(':')) return { type: 'actor', id: addActor(ref.slice(1, -1)) };
    const key = ref.startsWith('"') ? ref.slice(1, -1) : ref;
    const hit = byKey.get(key);
    if (hit) return hit;
    return { type: 'actor', id: addActor(key) }; // an undeclared bare word is an actor in PlantUML
  };

  const body = text.replace(/\/'[\s\S]*?'\//g, '');
  let skipNote = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line)) continue;
    if (skipNote) { if (/^end\s*note/i.test(line)) skipNote = false; continue; }
    if (/^(skinparam|title|header|footer|hide|show|left to right|top to bottom|!|scale|legend|end legend)/i.test(line)) continue;
    if (/^(floating\s+)?note\b/i.test(line)) { if (!/:/.test(line)) skipNote = true; continue; }
    if (line === '}') { stack.pop(); continue; }
    let m = line.match(/^(rectangle|package|frame|folder|node|cloud|boundary)\s+(?:"([^"]+)"|([^\s{]+))(?:\s+as\s+\w+)?[^{]*\{$/i);
    if (m) {
      const name = m[2] ?? m[3];
      let b = model.boundaries.find((x) => x.name === name);
      if (!b) { b = { id: `s${model.boundaries.length + 1}`, name }; model.boundaries.push(b); }
      stack.push(b.id);
      continue;
    }
    if (line.endsWith('{')) { stack.push(null); continue; }
    m = line.match(/^actor\/?\s+(.*)$/i);
    if (m) { const d = decl(m[1]); if (d) addActor(d.name, d.alias); continue; }
    m = line.match(/^usecase\/?\s+(.*)$/i);
    if (m) { const d = decl(m[1]); if (d) addCase(d.name, d.alias); continue; }
    m = line.match(/^(\([^)]+\)|:[^:]+:)(?:\s+as\s+(\w+))?\s*$/);
    if (m) { const d = decl(line); if (d) (line.startsWith('(') ? addCase : addActor)(d.name, d.alias); continue; }
    m = line.match(LINK);
    if (m) {
      const [, ra, m1, arrow, m2, rb, labelRaw] = m;
      let left = resolve(ra), right = resolve(rb);
      let leftMult = m1, rightMult = m2;
      const label = labelRaw?.trim() ?? '';
      const stereo = label.match(/<<\s*(include|extend)s?\s*>>|^(include|extend)s?$/i);
      const generalization = /\|>/.test(arrow) || /<\|/.test(arrow);
      const flipped = /^<\|?/.test(arrow) && !/>$/.test(arrow);
      if (flipped) { [left, right] = [right, left]; [leftMult, rightMult] = [rightMult, leftMult]; }
      let kind: UcRelKind = 'association';
      if (stereo) kind = (stereo[1] ?? stereo[2]).toLowerCase() as UcRelKind;
      else if (generalization) kind = 'generalization';
      else if (/^\.+>?$/.test(arrow.replace(/[a-z]/g, '')) && !/^[-]/.test(arrow)) warnings.push(`Dotted link "${line}" read as an association`);
      model.relations.push({
        from: left.id, to: right.id, kind,
        ...(!stereo && label ? { label } : {}),
        ...(leftMult ? { fromMult: leftMult } : {}),
        ...(rightMult ? { toMult: rightMult } : {}),
      });
      continue;
    }
    warnings.push(`Skipped: ${line}`);
  }
  return { model, warnings };
}
