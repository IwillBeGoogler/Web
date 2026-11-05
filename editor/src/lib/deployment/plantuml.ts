import { emptyDeploymentModel, type DepDef, type DeploymentKind, type DeploymentLinkKind, type DeploymentModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');
const KEY: Record<DeploymentKind, string> = { node: 'node', device: 'device', executionEnvironment: 'frame', artifact: 'artifact', component: 'component' };

/** deployment diagram as PlantUML: node / device / frame (execution environment) blocks hold their elements; paths are `--`, deploy and manifest are `..>` with a stereotype */
export function renderDeploymentPlantuml(model: DeploymentModel): string {
  const id = new Map<string, string>();
  model.nodes.forEach((c, i) => id.set(c.id, `D${i + 1}`));
  const lines = ['@startuml'];
  const walk = (parent: string | undefined, pad: string) => {
    for (const c of model.nodes.filter((x) => (x.parent && id.has(x.parent) ? x.parent : undefined) === parent)) {
      const kids = model.nodes.some((x) => x.parent === c.id);
      lines.push(`${pad}${KEY[c.kind]} "${q(c.name)}" as ${id.get(c.id)}${c.stereotype ? ` <<${q(c.stereotype)}>>` : ''}${kids ? ' {' : ''}`);
      if (kids) { walk(c.id, pad + '  '); lines.push(`${pad}}`); }
    }
  };
  walk(undefined, '');
  for (const l of model.links) {
    const a = id.get(l.from), b = id.get(l.to);
    if (!a || !b) continue;
    if (l.kind === 'communication') lines.push(`${a} -- ${b}${l.label ? ` : ${q(l.label)}` : ''}`);
    else lines.push(`${a} ..> ${b} : <<${l.kind}>>${l.label ? ` ${q(l.label)}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

/** deployment markers: a device or frame block, or nodes with artifacts and nothing of the component diagram (components, interfaces, `[x]`) */
export const looksLikeDeploymentPlantuml = (text: string): boolean => {
  if (!/@startuml/i.test(text)) return false;
  if (/^\s*(class|enum|abstract|participant|actor|usecase|state|start|boundary|control|entity|alt|loop|opt|activate|autonumber|interface)\b/im.test(text)) return false;
  if (/^\s*\(.+\)/m.test(text) || /^\s*\(\)/m.test(text) || /^\s*\[[^\]\n]+\]/m.test(text) || /\[[^\]\n]+\]\s*<?[-.]+/.test(text)) return false;
  return /^\s*(device|frame)\b/im.test(text) || (/^\s*node\b/im.test(text) && /^\s*artifact\b/im.test(text));
};

const BLOCK: Record<string, DeploymentKind> = { node: 'node', device: 'device', frame: 'executionEnvironment', artifact: 'artifact', component: 'component', cloud: 'node', database: 'node', folder: 'node', rectangle: 'node', storage: 'node', package: 'node' };
const REF = '("[^"\\n]+"|\\w+)';
const ARROW = '(<?[-.]+(?:\\w+[-.]*)?>?)';
const LINK = new RegExp(`^${REF}\\s*${ARROW}\\s*${REF}\\s*(?::\\s*(.*))?$`);

/** Parse the deployment subset of PlantUML: node / device / frame / artifact / component blocks (nesting) and links. */
export function parseDeploymentPlantuml(text: string): { model: DeploymentModel; warnings: string[] } {
  const model = emptyDeploymentModel();
  const warnings: string[] = [];
  const byKey = new Map<string, string>();
  const stack: string[] = [];
  let n = 0;
  const add = (name: string, kind: DeploymentKind, alias?: string, stereotype?: string): string => {
    const have = byKey.get(alias ?? name) ?? byKey.get(name);
    if (have) {
      const c = model.nodes.find((x) => x.id === have)!;
      if (!c.parent && stack.length) c.parent = stack[stack.length - 1];
      return have;
    }
    const id = `d${++n}`;
    const def: DepDef = { id, name, kind, ...(stereotype ? { stereotype } : {}), ...(stack.length ? { parent: stack[stack.length - 1] } : {}) };
    model.nodes.push(def);
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
    const m = line.match(/^(node|device|frame|artifact|component|cloud|database|folder|rectangle|storage|package)\s+(?:"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?([^{]*?)\s*(\{)?$/i);
    if (m) {
      const id = add(m[2] ?? m[3], BLOCK[m[1].toLowerCase()], m[4], stereo(m[5] ?? ''));
      if (m[6]) stack.push(id);
      continue;
    }
    const lk = line.match(LINK);
    if (lk) { raw.push({ a: lk[1], arrow: lk[2], b: lk[3], label: lk[4]?.trim(), line }); continue; }
    warnings.push(`Skipped: ${line}`);
  }
  const ref = (r: string): string => (r.startsWith('"') ? r.slice(1, -1) : r);
  for (const r of raw) {
    let a = r.a, b = r.b;
    if (/^</.test(r.arrow) && !/>$/.test(r.arrow)) [a, b] = [b, a];
    const dotted = /\./.test(r.arrow);
    const from = byKey.get(ref(a)) ?? add(ref(a), 'node');
    const to = byKey.get(ref(b)) ?? add(ref(b), 'node');
    let label = r.label;
    let kind: DeploymentLinkKind = 'communication';
    const tag = label?.match(/^(?:<<|«)\s*(deploy|manifest)\s*(?:>>|»)\s*(.*)$/i);
    if (tag) { kind = tag[1].toLowerCase() as DeploymentLinkKind; label = tag[2].trim() || undefined; }
    else if (dotted) kind = model.nodes.find((x) => x.id === from)?.kind === 'artifact' && model.nodes.find((x) => x.id === to)?.kind === 'component' ? 'manifest' : 'deploy';
    model.links.push({ from, to, kind, ...(label ? { label } : {}) });
  }
  return { model, warnings };
}
