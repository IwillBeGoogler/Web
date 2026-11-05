import { addRelation, baseName, emptyModel, ensureClass, type MemberDef, type UmlClassDef, type UmlModel, type UmlParseResult } from './model';
import { parseRelationLine, relationLine } from './arrows';
import { splitTop } from './member';
import type { ClassKind, Visibility } from './types';

const DECL = /^(abstract\s+class|abstract|class|interface|enum|annotation|entity)\s+("[^"]+"|[\w.$]+)\s*(<[^>]*(?:<[^>]*>[^>]*)*>)?\s*(?:<<\s*([^>]+?)\s*>>)?\s*(?:extends\s+([\w.$<>, ]+?))?\s*(?:implements\s+([\w.$<>, ]+?))?\s*(\{)?\s*$/;
const KIND: Record<string, ClassKind> = { 'abstract class': 'abstract', abstract: 'abstract', class: 'class', interface: 'interface', enum: 'enum', annotation: 'interface', entity: 'class' };
const IGNORED = /^(@startuml|@enduml|skinparam\b|hide\b|show\b|left to right|top to bottom|title\b|header\b|footer\b|legend\b|end legend|!|scale\b|set\b|allowmixing|' )/i;

function parseParams(s: string) {
  return splitTop(s).map((p) => {
    const c = p.indexOf(':');
    if (c >= 0) return { name: p.slice(0, c).trim(), type: p.slice(c + 1).trim() };
    const w = p.trim().split(/\s+/);
    return w.length > 1 ? { name: w[w.length - 1], type: w.slice(0, -1).join(' ') } : { name: p.trim() };
  });
}

/** `{static} -count : int`, `+{abstract} area() : double`, `String name`, `+find(id : String) : T` */
export function parsePlantMember(raw: string, literal = false): { kind: 'attribute' | 'operation'; def: MemberDef } {
  let t = raw.trim();
  if (literal) return { kind: 'attribute', def: { visibility: '', name: t } };
  let isStatic = false;
  let isAbstract = false;
  let visibility: Visibility = '+';
  let sawVis = false;
  for (let guard = 0; guard < 6; guard++) {
    const mod = /^\{(static|abstract|classifier|field|method)\}\s*/i.exec(t);
    if (mod) { if (/static|classifier/i.test(mod[1])) isStatic = true; if (/abstract/i.test(mod[1])) isAbstract = true; t = t.slice(mod[0].length); continue; }
    if (!sawVis && /^[+\-#~]/.test(t)) { visibility = t[0] as Visibility; sawVis = true; t = t.slice(1).trim(); continue; }
    break;
  }
  if (t.includes('(')) {
    const open = t.indexOf('(');
    let depth = 0;
    let close = t.length;
    for (let i = open; i < t.length; i++) { if (t[i] === '(') depth++; else if (t[i] === ')' && --depth === 0) { close = i; break; } }
    const before = t.slice(0, open).trim();
    const after = t.slice(close + 1).trim().replace(/^:\s*/, '');
    // "ret name(args)" or "name(args) : ret"
    const bw = before.split(/\s+/);
    const name = bw[bw.length - 1];
    const ret = after || (bw.length > 1 ? bw.slice(0, -1).join(' ') : '');
    return { kind: 'operation', def: { visibility, name, params: parseParams(t.slice(open + 1, close)), ...(ret ? { type: ret } : {}), ...(isStatic ? { static: true } : {}), ...(isAbstract ? { abstract: true } : {}) } };
  }
  let name = t;
  let type: string | undefined;
  const c = t.indexOf(':');
  if (c >= 0) { name = t.slice(0, c).trim(); type = t.slice(c + 1).trim(); }
  else { const i = t.lastIndexOf(' '); if (i > 0) { type = t.slice(0, i).trim(); name = t.slice(i + 1).trim(); } }
  return { kind: 'attribute', def: { visibility, name, ...(type ? { type } : {}), ...(isStatic ? { static: true } : {}) } };
}

/** Parse PlantUML class diagrams (classes, interfaces, enums, packages, members and the common arrows). */
export function parsePlantUml(src: string): UmlParseResult {
  const model = emptyModel();
  const warnings: string[] = [];
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const scope: { kind: 'package' | 'class'; name?: string }[] = [];
  const pkgName = () => scope.filter((s) => s.kind === 'package').map((s) => s.name).join('.') || undefined;
  let cur: UmlClassDef | null = null;
  let note = false;
  const declare = (name: string): UmlClassDef => ensureClass(model, name.replace(/^"|"$/g, ''));
  /** a class named only as a parent: kept as an external stub unless it is declared later */
  const ref = (name: string): void => { if (!model.classes.some((x) => x.name === name)) ensureClass(model, name, { external: true }); };
  for (const line of lines) {
    if (note) { if (/^end\s*note$/i.test(line)) note = false; continue; }
    if (/^note\b/i.test(line)) { if (!line.includes(':')) note = true; continue; }
    if (cur) {
      if (line === '}') { scope.pop(); cur = null; continue; }
      if (line === '--' || line === '..' || line === '==' || line === '__') continue;
      const { kind, def } = parsePlantMember(line, cur.kind === 'enum');
      if (kind === 'attribute') cur.attributes.push(def); else cur.operations.push(def);
      continue;
    }
    if (IGNORED.test(line)) continue;
    const pk = /^(package|namespace|folder|frame|rectangle)\s+("[^"]+"|[\w.]+)(?:\s+<<[^>]*>>)?(?:\s+#\w+)?\s*\{\s*$/.exec(line);
    if (pk) { scope.push({ kind: 'package', name: pk[2].replace(/"/g, '') }); continue; }
    if (line === '}') { scope.pop(); continue; }
    const d = DECL.exec(line);
    if (d) {
      const name = d[2].replace(/"/g, '');
      const existing = model.classes.find((c) => c.name === name);
      const c = existing ?? declare(name);
      c.kind = KIND[d[1].replace(/\s+/g, ' ')] ?? 'class';
      if (d[3]) c.generics = d[3].slice(1, -1);
      if (d[4]) c.stereotype = d[4];
      const pkg = pkgName();
      if (pkg) c.package = pkg;
      delete c.external;
      for (const sup of splitTop(d[5] ?? '')) { const to = baseName(sup); ref(to); addRelation(model, { from: name, to, kind: 'inheritance' }); }
      for (const sup of splitTop(d[6] ?? '')) { const to = baseName(sup); ref(to); addRelation(model, { from: name, to, kind: 'realization' }); }
      if (d[7]) { cur = c; scope.push({ kind: 'class' }); }
      continue;
    }
    const rel = parseRelationLine(line);
    if (rel) {
      const f = baseName(rel.from);
      const t = baseName(rel.to);
      declare(f); declare(t);
      addRelation(model, { ...rel, from: f, to: t });
      continue;
    }
    const mem = /^([\w.$"]+)\s*:\s*(.+)$/.exec(line);
    if (mem) {
      const c = declare(mem[1]);
      const { kind, def } = parsePlantMember(mem[2], c.kind === 'enum');
      if (kind === 'attribute') c.attributes.push(def); else c.operations.push(def);
      continue;
    }
    warnings.push(`Skipped: ${line}`);
  }
  return { model, warnings };
}

// ---------------------------------------------------------------- export
const KIND_OUT: Record<ClassKind, string> = { class: 'class', interface: 'interface', abstract: 'abstract class', enum: 'enum' };

function memberOut(m: MemberDef, comp: 'attributes' | 'operations', kind: ClassKind): string {
  if (kind === 'enum' && comp === 'attributes') return m.name;
  const mods = `${m.static ? '{static} ' : ''}`;
  const abs = m.abstract ? '{abstract} ' : '';
  if (comp === 'attributes') return `${mods}${m.visibility}${m.name}${m.type ? ` : ${m.type}` : ''}`;
  const params = (m.params ?? []).map((p) => (p.type ? `${p.name} : ${p.type}` : p.name)).join(', ');
  return `${mods}${m.visibility}${abs}${m.name}(${params})${m.type ? ` : ${m.type}` : ''}`;
}

export function renderPlantUml(model: UmlModel): string {
  const out = ['@startuml'];
  const classLines = (c: UmlClassDef, indent: string) => {
    const head = `${indent}${KIND_OUT[c.kind]} ${c.name}${c.generics ? `<${c.generics}>` : ''}${c.stereotype ? ` <<${c.stereotype}>>` : ''}`;
    if (!c.attributes.length && !c.operations.length) { out.push(head); return; }
    out.push(`${head} {`);
    for (const a of c.attributes) out.push(`${indent}  ${memberOut(a, 'attributes', c.kind)}`);
    for (const o of c.operations) out.push(`${indent}  ${memberOut(o, 'operations', c.kind)}`);
    out.push(`${indent}}`);
  };
  const shown = model.classes.filter((c) => !(c.external && !c.attributes.length && !c.operations.length));
  const pkgs = [...new Set(shown.map((c) => c.package).filter((p): p is string => !!p))];
  for (const p of pkgs) {
    out.push(`package ${p} {`);
    for (const c of shown.filter((x) => x.package === p)) classLines(c, '  ');
    out.push('}');
  }
  for (const c of shown.filter((x) => !x.package)) classLines(c, '');
  const names = new Set(model.classes.map((c) => c.name));
  for (const r of model.relations) if (r.kind !== 'note' && names.has(r.from) && names.has(r.to)) out.push(relationLine(r));
  out.push('@enduml');
  return `${out.join('\n')}\n`;
}
