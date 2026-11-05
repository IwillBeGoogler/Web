import { addRelation, emptyModel, ensureClass, baseName, type MemberDef, type UmlClassDef, type UmlModel, type UmlParseResult } from './model';
import { parseRelationLine, relationLine } from './arrows';
import { splitTop } from './member';
import type { ClassKind, Visibility } from './types';

/** `List~int~` -> `List<int>` */
export function tildeToAngle(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '~') { out += ch; continue; }
    const prev = s[i - 1] ?? '';
    const next = s[i + 1] ?? '';
    out += /[\w>]/.test(prev) && /[\w]/.test(next) ? '<' : '>';
  }
  return out;
}
const angleToTilde = (s: string): string => s.replace(/</g, '~').replace(/>/g, '~');

const STEREO: Record<string, ClassKind> = { interface: 'interface', abstract: 'abstract', enumeration: 'enum', enum: 'enum' };
const VIS = /^[+\-#~]/;

function parseParams(s: string): { name: string; type?: string }[] {
  return splitTop(s).map((p) => {
    const c = p.indexOf(':');
    if (c >= 0) return { name: p.slice(0, c).trim(), type: tildeToAngle(p.slice(c + 1).trim()) };
    const words = p.trim().split(/\s+/);
    return words.length > 1 ? { name: words[words.length - 1], type: tildeToAngle(words.slice(0, -1).join(' ')) } : { name: p.trim() };
  });
}

/** One Mermaid member line: `+String name`, `-id: int`, `+area() double*`, `+count$ int` ... */
export function parseMermaidMember(raw: string, literal = false): { kind: 'attribute' | 'operation'; def: MemberDef } {
  let t = raw.trim();
  if (literal) return { kind: 'attribute', def: { visibility: '', name: t } };
  let visibility: Visibility = '+';
  if (VIS.test(t)) { visibility = t[0] as Visibility; t = t.slice(1).trim(); }
  let isStatic = false;
  let isAbstract = false;
  if (t.endsWith('$')) { isStatic = true; t = t.slice(0, -1).trim(); }
  if (t.endsWith('*')) { isAbstract = true; t = t.slice(0, -1).trim(); }
  if (t.includes('(')) {
    const open = t.indexOf('(');
    let depth = 0;
    let close = t.length;
    for (let i = open; i < t.length; i++) { if (t[i] === '(') depth++; else if (t[i] === ')' && --depth === 0) { close = i; break; } }
    let rest = t.slice(close + 1).trim();
    if (rest.endsWith('$')) { isStatic = true; rest = rest.slice(0, -1).trim(); }
    if (rest.endsWith('*')) { isAbstract = true; rest = rest.slice(0, -1).trim(); }
    rest = rest.replace(/^:\s*/, '');
    return {
      kind: 'operation',
      def: { visibility, name: t.slice(0, open).trim(), params: parseParams(t.slice(open + 1, close)), ...(rest ? { type: tildeToAngle(rest) } : {}), ...(isStatic ? { static: true } : {}), ...(isAbstract ? { abstract: true } : {}) },
    };
  }
  let name = t;
  let type: string | undefined;
  const c = t.indexOf(':');
  if (c >= 0) { name = t.slice(0, c).trim(); type = tildeToAngle(t.slice(c + 1).trim()); }
  else {
    const i = t.lastIndexOf(' ');
    if (i > 0) { type = tildeToAngle(t.slice(0, i).trim()); name = t.slice(i + 1).trim(); }
  }
  return { kind: 'attribute', def: { visibility, name, ...(type ? { type } : {}), ...(isStatic ? { static: true } : {}) } };
}

function addMember(c: UmlClassDef, raw: string): void {
  const { kind, def } = parseMermaidMember(raw, c.kind === 'enum');
  if (kind === 'attribute') c.attributes.push(def); else c.operations.push(def);
}

/** Parse a Mermaid `classDiagram`. */
export function parseMermaid(src: string): UmlParseResult {
  const model = emptyModel();
  const warnings: string[] = [];
  const lines = src.replace(/%%.*$/gm, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !/^classDiagram(-v2)?\b/i.test(lines[0])) warnings.push('Missing "classDiagram" header');
  let cur: UmlClassDef | null = null;
  const declare = (rawName: string): UmlClassDef => {
    const m = /^([\w.$]+)(?:~(.*)~)?$/.exec(rawName.replace(/`/g, ''));
    const name = m?.[1] ?? rawName;
    const c = ensureClass(model, name);
    if (m?.[2]) c.generics = tildeToAngle(`~${m[2]}~`).slice(1, -1) || m[2];
    return c;
  };
  const stereotype = (c: UmlClassDef, s: string) => {
    const key = s.toLowerCase();
    if (STEREO[key]) c.kind = STEREO[key]; else c.stereotype = s;
  };
  for (const line of lines.slice(1)) {
    if (cur) {
      if (line === '}') { cur = null; continue; }
      const st = /^<<\s*([^>]+?)\s*>>$/.exec(line);
      if (st) { stereotype(cur, st[1]); continue; }
      addMember(cur, line);
      continue;
    }
    if (/^direction\s+/i.test(line) || /^(title|accTitle|accDescr)\b/i.test(line) || line.startsWith('note ') || /^(namespace\s+\S+\s*\{|\})$/.test(line) || /^(click|link|callback|style|classDef|cssClass)\b/.test(line)) continue;
    const decl = /^class\s+(\S+?)(?:\s*\["[^"]*"\])?\s*(\{)?\s*$/.exec(line);
    if (decl) {
      const c = declare(decl[1]);
      if (decl[2]) cur = c;
      continue;
    }
    const ann = /^<<\s*([^>]+?)\s*>>\s+(\S+)$/.exec(line);
    if (ann) { stereotype(declare(ann[2]), ann[1]); continue; }
    const rel = parseRelationLine(line);
    if (rel) {
      const f = baseName(rel.from);
      const t = baseName(rel.to);
      declare(f); declare(t);
      addRelation(model, { ...rel, from: f, to: t });
      continue;
    }
    const mem = /^(\S+?)\s*:\s*(.+)$/.exec(line);
    if (mem) { const c = declare(mem[1]); addMember(c, mem[2]); continue; }
    warnings.push(`Skipped: ${line}`);
  }
  return { model, warnings };
}

// ---------------------------------------------------------------- export
const STEREO_OUT: Partial<Record<ClassKind, string>> = { interface: 'interface', abstract: 'abstract', enum: 'enumeration' };

function memberOut(m: MemberDef, comp: 'attributes' | 'operations', kind: ClassKind): string {
  if (kind === 'enum' && comp === 'attributes') return m.name;
  const vis = m.visibility || '';
  if (comp === 'attributes') return `${vis}${m.type ? `${angleToTilde(m.type)} ` : ''}${m.name}${m.static ? '$' : ''}`;
  const params = (m.params ?? []).map((p) => (p.type ? `${p.name}: ${angleToTilde(p.type)}` : p.name)).join(', ');
  return `${vis}${m.name}(${params})${m.type ? ` ${angleToTilde(m.type)}` : ''}${m.static ? '$' : ''}${m.abstract ? '*' : ''}`;
}

export function renderMermaid(model: UmlModel): string {
  const out = ['classDiagram'];
  for (const c of model.classes) {
    if (c.external && !c.attributes.length && !c.operations.length) continue;
    const head = `class ${c.name}${c.generics ? `~${angleToTilde(c.generics)}~` : ''}`;
    const st = STEREO_OUT[c.kind] ?? c.stereotype;
    if (!st && !c.attributes.length && !c.operations.length) { out.push(`  ${head}`); continue; }
    out.push(`  ${head} {`);
    if (st) out.push(`    <<${st}>>`);
    for (const a of c.attributes) out.push(`    ${memberOut(a, 'attributes', c.kind)}`);
    for (const o of c.operations) out.push(`    ${memberOut(o, 'operations', c.kind)}`);
    out.push('  }');
  }
  const names = new Set(model.classes.map((c) => c.name));
  for (const r of model.relations) if (r.kind !== 'note' && names.has(r.from) && names.has(r.to)) out.push(`  ${relationLine(r)}`);
  return `${out.join('\n')}\n`;
}
