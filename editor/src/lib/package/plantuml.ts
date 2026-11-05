import { emptyPackageModel, type PackageLinkKind, type PackageModel, type PkgClassKind } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');

/** package diagram as PlantUML: package blocks hold packages and classes; import / access / merge are `..>` arrows with a stereotype */
export function renderPackagePlantuml(model: PackageModel): string {
  const id = new Map<string, string>();
  model.packages.forEach((p, i) => id.set(p.id, `P${i + 1}`));
  model.classes.forEach((c, i) => id.set(c.id, `C${i + 1}`));
  const lines = ['@startuml'];
  const KEY: Record<PkgClassKind, string> = { class: 'class', interface: 'interface', abstract: 'abstract class', enum: 'enum' };
  const walk = (parent: string | undefined, pad: string) => {
    const mine = (x: { parent?: string }) => (x.parent && id.has(x.parent) ? x.parent : undefined) === parent;
    for (const p of model.packages.filter(mine)) {
      lines.push(`${pad}package "${q(p.name)}" as ${id.get(p.id)} {`);
      walk(p.id, pad + '  ');
      lines.push(`${pad}}`);
    }
    for (const c of model.classes.filter(mine)) lines.push(`${pad}${KEY[c.kind]} "${q(c.name)}" as ${id.get(c.id)}`);
  };
  walk(undefined, '');
  for (const l of model.links) {
    const a = id.get(l.from), b = id.get(l.to);
    if (!a || !b) continue;
    lines.push(l.kind === 'dependency' ? `${a} ..> ${b}${l.label ? ` : ${q(l.label)}` : ''}` : `${a} ..> ${b} : <<${l.kind}>>${l.label ? ` ${q(l.label)}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

/** package markers: a package block and either an import / access / merge arrow or nothing of the other diagrams */
export const looksLikePackagePlantuml = (text: string): boolean => {
  if (!/@startuml/i.test(text) || !/^\s*package\b/im.test(text)) return false;
  if (/^\s*(object|participant|actor|usecase|state|start|boundary|control|entity|alt|loop|opt|activate|autonumber|node|device|frame|artifact|component|database|cloud|rectangle)\b/im.test(text)) return false;
  if (/^\s*\(.+\)/m.test(text) || /^\s*\[[^\]\n]+\]/m.test(text)) return false;
  if (/<<\s*(import|access|merge)\s*>>|«\s*(import|access|merge)\s*»/i.test(text)) return true;
  return !/^\s*(class|interface|enum|abstract)\b/im.test(text);
};

const REF = '("[^"\\n]+"|\\w+)';
const ARROW = '(<?[-.]+(?:\\w+[-.]*)?>?)';
const LINK = new RegExp(`^${REF}\\s*${ARROW}\\s*${REF}\\s*(?::\\s*(.*))?$`);
const CLASS_KEYS: Record<string, PkgClassKind> = { class: 'class', interface: 'interface', enum: 'enum', 'abstract class': 'abstract', abstract: 'abstract' };

/** Parse the package subset of PlantUML: nested package blocks, class / interface / enum lines (bodies skipped) and arrows between them. */
export function parsePackagePlantuml(text: string): { model: PackageModel; warnings: string[] } {
  const model = emptyPackageModel();
  const warnings: string[] = [];
  const byKey = new Map<string, string>();
  const stack: ({ kind: 'package'; id: string } | { kind: 'body' })[] = [];
  let n = 0;
  const parentId = (): string | undefined => { for (let i = stack.length - 1; i >= 0; i--) { const f = stack[i]; if (f.kind === 'package') return f.id; } return undefined; };
  const addPackage = (name: string, alias?: string): string => {
    const have = byKey.get(alias ?? name) ?? byKey.get(name);
    if (have) return have;
    const id = `p${++n}`;
    model.packages.push({ id, name, ...(parentId() ? { parent: parentId()! } : {}) });
    byKey.set(name, id);
    if (alias) byKey.set(alias, id);
    return id;
  };
  const addClass = (name: string, kind: PkgClassKind, alias?: string): string => {
    const have = byKey.get(alias ?? name) ?? byKey.get(name);
    if (have) return have;
    const id = `c${++n}`;
    model.classes.push({ id, name, kind, ...(parentId() ? { parent: parentId()! } : {}) });
    byKey.set(name, id);
    if (alias) byKey.set(alias, id);
    return id;
  };
  const raw: { a: string; arrow: string; b: string; label?: string }[] = [];
  let skipNote = false;
  for (const l0 of text.replace(/\/'[\s\S]*?'\//g, '').split(/\r?\n/)) {
    const line = l0.trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line)) continue;
    if (skipNote) { if (/^end\s*note/i.test(line)) skipNote = false; continue; }
    if (/^(skinparam|title|header|footer|hide|show|left to right|top to bottom|!|scale|legend|end legend)/i.test(line)) continue;
    if (/^(floating\s+)?note\b/i.test(line)) { if (!/:/.test(line)) skipNote = true; continue; }
    if (line === '}') { stack.pop(); continue; }
    if (stack.length && stack[stack.length - 1].kind === 'body') {
      if (/\{\s*$/.test(line)) stack.push({ kind: 'body' });
      continue;
    }
    const pk = line.match(/^(?:package|namespace|folder|frame|rectangle)\s+(?:"([^"]+)"|([\w.]+))(?:\s+as\s+(\w+))?[^{]*?\s*(\{)?$/i);
    if (pk) {
      const id = addPackage(pk[1] ?? pk[2], pk[3]);
      if (pk[4]) stack.push({ kind: 'package', id });
      continue;
    }
    const cl = line.match(/^(abstract\s+class|abstract|class|interface|enum)\s+(?:"([^"]+)"|([\w.<>]+))(?:\s+as\s+(\w+))?[^{]*?\s*(\{)?$/i);
    if (cl) {
      addClass(cl[2] ?? cl[3], CLASS_KEYS[cl[1].toLowerCase().replace(/\s+/g, ' ')], cl[4]);
      if (cl[5]) stack.push({ kind: 'body' });
      continue;
    }
    const lk = line.match(LINK);
    if (lk) { raw.push({ a: lk[1], arrow: lk[2], b: lk[3], label: lk[4]?.trim() }); continue; }
    warnings.push(`Skipped: ${line}`);
  }
  const ref = (r: string): string => (r.startsWith('"') ? r.slice(1, -1) : r);
  for (const r of raw) {
    let a = r.a, b = r.b;
    if (/^</.test(r.arrow) && !/>$/.test(r.arrow)) [a, b] = [b, a];
    const from = byKey.get(ref(a)), to = byKey.get(ref(b));
    if (!from || !to) { warnings.push(`Skipped link to an unknown element: ${ref(a)} ${r.arrow} ${ref(b)}`); continue; }
    let label = r.label;
    let kind: PackageLinkKind = 'dependency';
    const tag = label?.match(/^(?:<<|«)\s*(import|access|merge)\s*(?:>>|»)\s*(.*)$/i);
    if (tag) { kind = tag[1].toLowerCase() as PackageLinkKind; label = tag[2].trim() || undefined; }
    model.links.push({ from, to, kind, ...(label ? { label } : {}) });
  }
  return { model, warnings };
}
