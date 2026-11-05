import { emptyComponentModel, type CompDef, type CompKind, type ComponentModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');

/** component diagram as PlantUML: nodes / components that hold others as blocks, interfaces as lollipop (`-`) and socket (`..>`) links */
export function renderComponentPlantuml(model: ComponentModel): string {
  const id = new Map<string, string>();
  model.comps.forEach((c, i) => id.set(c.id, `C${i + 1}`));
  const lines = ['@startuml'];
  const names = [...new Set(model.comps.flatMap((c) => [...c.provides, ...c.requires]))];
  const iid = new Map(names.map((n, i) => [n, `I${i + 1}`]));
  const decl = (c: CompDef, pad: string, open: boolean) => {
    const st = c.stereotype ? ` <<${q(c.stereotype)}>>` : '';
    const key = c.kind === 'component' ? (open ? 'component' : '') : c.kind;
    const head = key ? `${key} "${q(c.name)}"` : `[${q(c.name)}]`;
    lines.push(`${pad}${head} as ${id.get(c.id)}${st}${open ? ' {' : ''}`);
  };
  const walk = (parent: string | undefined, pad: string) => {
    for (const c of model.comps.filter((x) => (x.parent && id.has(x.parent) ? x.parent : undefined) === parent)) {
      const kids = model.comps.some((x) => x.parent === c.id);
      decl(c, pad, kids);
      if (kids) { walk(c.id, pad + '  '); lines.push(`${pad}}`); }
    }
  };
  walk(undefined, '');
  for (const n of names) lines.push(`interface "${q(n)}" as ${iid.get(n)}`);
  for (const c of model.comps) {
    for (const n of c.provides) lines.push(`${id.get(c.id)} - ${iid.get(n)}`);
    for (const n of c.requires) lines.push(`${id.get(c.id)} ..> ${iid.get(n)}`);
  }
  for (const l of model.links) {
    const a = id.get(l.from), b = id.get(l.to);
    if (a && b) lines.push(`${a} ${l.kind === 'assembly' ? '--' : '..>'} ${b}${l.label ? ` : ${q(l.label)}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

export const looksLikeComponentPlantuml = (text: string): boolean =>
  /@startuml/i.test(text) &&
  !/^\s*(class|enum|abstract|participant|actor|usecase|state|start|boundary|control|entity|alt|loop|opt|activate|autonumber)\b/im.test(text) &&
  !/^\s*\(.+\)/m.test(text) &&
  (/^\s*(component|node|artifact)\b/im.test(text) || /^\s*\[[^\]\n]+\]/m.test(text) || /\[[^\]\n]+\]\s*<?[-.]+/.test(text));

const REF = '(\\[[^\\]\\n]+\\]|\\(\\)\\s*"[^"\\n]+"|"[^"\\n]+"|\\w+)';
const ARROW = '((?:<\\|?|<)?[-.]+(?:\\w+[-.]*)?(?:\\|>|>|\\(|0\\))?|\\)-+|-+0\\)-*)';
const LINK = new RegExp(`^${REF}\\s*${ARROW}\\s*${REF}\\s*(?::\\s*(.*))?$`);
const BLOCK: Record<string, CompKind> = { component: 'component', node: 'node', artifact: 'artifact', cloud: 'node', database: 'node', folder: 'node', frame: 'node', package: 'node', rectangle: 'node', storage: 'node' };

/** Parse the component subset of PlantUML: `[Name]`, component / node / artifact blocks (nesting), `interface`, lollipop and socket links, dependencies. */
export function parseComponentPlantuml(text: string): { model: ComponentModel; warnings: string[] } {
  const model = emptyComponentModel();
  const warnings: string[] = [];
  const byKey = new Map<string, string>();
  const ifaceKeys = new Map<string, string>(); // alias or name -> interface name
  const stack: string[] = [];
  let n = 0;
  const addComp = (name: string, kind: CompKind, alias?: string, stereotype?: string): string => {
    const have = byKey.get(alias ?? name) ?? byKey.get(name);
    if (have) {
      const c = model.comps.find((x) => x.id === have)!;
      if (!c.parent && stack.length) c.parent = stack[stack.length - 1];
      return have;
    }
    const id = `c${++n}`;
    model.comps.push({ id, name, kind, provides: [], requires: [], ...(stereotype ? { stereotype } : {}), ...(stack.length ? { parent: stack[stack.length - 1] } : {}) });
    byKey.set(name, id);
    if (alias) byKey.set(alias, id);
    return id;
  };
  const stereo = (s: string) => s.match(/<<\s*([^>]+?)\s*>>/)?.[1];
  const raw: { a: string; arrow: string; b: string; label?: string; line: string }[] = [];
  let skipNote = false;
  for (const l0 of text.replace(/\/'[\s\S]*?'\//g, '').split(/\r?\n/)) {
    const line = l0.trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line)) continue;
    if (skipNote) { if (/^end\s*note/i.test(line)) skipNote = false; continue; }
    if (/^(skinparam|title|header|footer|hide|show|left to right|top to bottom|!|scale|legend|end legend)/i.test(line)) continue;
    if (/^(floating\s+)?note\b/i.test(line)) { if (!/:/.test(line)) skipNote = true; continue; }
    if (line === '}') { stack.pop(); continue; }
    let m = line.match(/^(component|node|artifact|cloud|database|folder|frame|package|rectangle|storage)\s+(?:\[([^\]]+)\]|"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?([^{]*?)\s*(\{)?$/i);
    if (m) {
      const kind = BLOCK[m[1].toLowerCase()];
      const name = m[2] ?? m[3] ?? m[4];
      const id = addComp(name, kind, m[5], stereo(m[6] ?? ''));
      if (m[7]) stack.push(id);
      continue;
    }
    m = line.match(/^(?:interface|\(\))\s+(?:"([^"]+)"\s+as\s+(\w+)|(\w+)\s+as\s+"([^"]+)"|"([^"]+)"|(\w+))/i);
    if (m) {
      const name = m[1] ?? m[4] ?? m[5] ?? m[6];
      ifaceKeys.set(m[2] ?? m[3] ?? name, name);
      ifaceKeys.set(name, name);
      continue;
    }
    m = line.match(/^\[([^\]]+)\](?:\s+as\s+(\w+))?\s*(<<.*>>)?\s*(\{)?$/);
    if (m) { const id = addComp(m[1], 'component', m[2], stereo(m[3] ?? '')); if (m[4]) stack.push(id); continue; }
    if (/^(portin|portout|port)\b/i.test(line)) { warnings.push(`Ports are not imported: ${line}`); continue; }
    m = line.match(LINK);
    if (m) { raw.push({ a: m[1], arrow: m[2], b: m[3], label: m[4]?.trim(), line }); continue; }
    warnings.push(`Skipped: ${line}`);
  }
  const compOf = (ref: string): string | undefined => {
    const key = ref.startsWith('[') ? ref.slice(1, -1) : ref.startsWith('"') ? ref.slice(1, -1) : ref;
    return byKey.get(key);
  };
  const ifaceOf = (ref: string): string | undefined => {
    if (ref.startsWith('()')) return ref.replace(/^\(\)\s*"/, '').replace(/"$/, '');
    const key = ref.startsWith('"') ? ref.slice(1, -1) : ref;
    return ref.startsWith('[') ? undefined : ifaceKeys.get(key);
  };
  const push = (list: string[], name: string) => { if (!list.includes(name)) list.push(name); };
  for (const r of raw) {
    let a = r.a, b = r.b;
    const leftHead = /^<\|?/.test(r.arrow) || /^\)-/.test(r.arrow);
    const rightHead = />$|\($|0\)-*$/.test(r.arrow);
    if (leftHead && !rightHead) [a, b] = [b, a];
    const dotted = /\./.test(r.arrow);
    const socket = /\($/.test(r.arrow) || /^\)-/.test(r.arrow) || /0\)/.test(r.arrow);
    const ca = compOf(a), cb = compOf(b);
    const bare = (x: string) => /^\w+$/.test(x);
    const lollipop = socket || (!rightHead && !dotted && /^-+$/.test(r.arrow));
    // an undeclared bare name next to a component on a lollipop / socket link is an interface
    const ia = ifaceOf(a) ?? (cb && !ca && bare(a) && lollipop ? a : undefined);
    const ib = ifaceOf(b) ?? (ca && !cb && bare(b) && lollipop ? b : undefined);
    if (ca && ib) {
      const c = model.comps.find((x) => x.id === ca)!;
      if (socket || rightHead || dotted) push(c.requires, ib); else push(c.provides, ib);
      continue;
    }
    if (ia && cb) {
      const c = model.comps.find((x) => x.id === cb)!;
      if (socket || rightHead || dotted) push(c.requires, ia); else push(c.provides, ia);
      continue;
    }
    if (ia || ib) { warnings.push(`Interface link without a component: ${r.line}`); continue; }
    const from = ca ?? addComp(a.replace(/^\[|\]$/g, '').replace(/^"|"$/g, ''), 'component');
    const to = cb ?? addComp(b.replace(/^\[|\]$/g, '').replace(/^"|"$/g, ''), 'component');
    model.links.push({ from, to, kind: rightHead || dotted ? 'dependency' : 'assembly', ...(r.label ? { label: r.label } : {}) });
  }
  return { model, warnings };
}
