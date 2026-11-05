import { parseMessageLine } from '../communication/messages';
import { emptyObjectModel, type ObjectModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');

/** object diagram as PlantUML: `object "name : Class" as O1 { slot = value }` and `O1 -- O2 : association name` (roles are not part of the export) */
export function renderObjectPlantuml(model: ObjectModel): string {
  const id = new Map(model.objects.map((o, i) => [o.id, `O${i + 1}`]));
  const lines = ['@startuml'];
  for (const o of model.objects) {
    const title = `${o.name}${o.className ? ` : ${o.className}` : ''}`;
    lines.push(`object "${q(title)}" as ${id.get(o.id)}${o.slots.length ? ' {' : ''}`);
    if (o.slots.length) {
      for (const s of o.slots) lines.push(`  ${s.name}${s.value ? ` = ${s.value}` : ''}`);
      lines.push('}');
    }
  }
  for (const l of model.links) {
    const a = id.get(l.from), b = id.get(l.to);
    if (!a || !b) continue;
    // communication diagram: PlantUML has no native form, so the numbered messages ride on the link label (`1.1: check() >`, `<` back, doubled = async)
    const label = l.messages?.length ? l.messages.map((m) => `${m.seq}: ${q(m.text)} ${m.dir === 'fwd' ? '>' : '<'}${m.async ? (m.dir === 'fwd' ? '>' : '<') : ''}`).join('\\n') : l.label ? q(l.label) : '';
    lines.push(`${a} -- ${b}${label ? ` : ${label}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

/** an `object` declaration (nothing else in the text is a real marker: class diagrams use `class`) */
export const looksLikeObjectPlantuml = (text: string): boolean => /@startuml/i.test(text) && /^\s*object\b/im.test(text) && !/^\s*(class|interface|enum|abstract|participant|actor|usecase|state|node|device|component)\b/im.test(text);

const REF = '("[^"\\n]+"|\\w+)';
const LINK = new RegExp(`^${REF}\\s*(?:"[^"]*"\\s*)?(<?[-.]+(?:\\w+[-.]*)?>?)\\s*(?:"[^"]*"\\s*)?${REF}\\s*(?::\\s*(.*))?$`);

/** Parse the object subset of PlantUML: object declarations with `slot = value` bodies and links between them. */
export function parseObjectPlantuml(text: string): { model: ObjectModel; warnings: string[] } {
  const model = emptyObjectModel();
  const warnings: string[] = [];
  const byKey = new Map<string, string>();
  let n = 0;
  let open: ObjectModel['objects'][number] | undefined;
  const add = (title: string, alias?: string): ObjectModel['objects'][number] => {
    const have = byKey.get(alias ?? title);
    if (have) return model.objects.find((o) => o.id === have)!;
    const k = title.lastIndexOf(' : ');
    const name = (k >= 0 ? title.slice(0, k) : title).trim(), className = k >= 0 ? title.slice(k + 3).trim() : undefined;
    const def = { id: `o${++n}`, name, ...(className ? { className } : {}), slots: [] as { name: string; value: string }[] };
    model.objects.push(def);
    byKey.set(alias ?? title, def.id);
    byKey.set(title, def.id);
    return def;
  };
  const raw: { a: string; arrow: string; b: string; label?: string }[] = [];
  for (const l0 of text.replace(/\/'[\s\S]*?'\//g, '').split(/\r?\n/)) {
    const line = l0.trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line)) continue;
    if (open) {
      if (line === '}') { open = undefined; continue; }
      const m = line.match(/^("[^"]+"|[^\s=]+)\s*(?:(?:=>|=)\s*(.*))?$/);
      if (m) open.slots.push({ name: m[1].replace(/^"|"$/g, ''), value: (m[2] ?? '').trim() });
      else warnings.push(`Skipped: ${line}`);
      continue;
    }
    if (/^(skinparam|title|header|footer|hide|show|left to right|top to bottom|!|scale|legend|end legend|note)/i.test(line)) continue;
    const m = line.match(/^object\s+(?:"([^"]+)"|([\w.]+))(?:\s+as\s+(\w+))?\s*(\{)?$/i);
    if (m) {
      const o = add(m[1] ?? m[2], m[3]);
      if (m[4]) open = o;
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
    if (!from || !to) { warnings.push(`Skipped link to an unknown object: ${ref(a)} ${r.arrow} ${ref(b)}`); continue; }
    // numbered label lines (`1: login() >`) are communication messages
    const lines = (r.label ?? '').split(/\\n|\n/).map((x) => x.trim()).filter(Boolean);
    const parsed = lines.map(parseMessageLine);
    if (lines.length && parsed.every(Boolean)) {
      model.links.push({ from, to, messages: parsed.map((m, i) => ({ id: `m${model.links.length + 1}_${i + 1}`, ...m! })) });
      continue;
    }
    model.links.push({ from, to, ...(r.label ? { label: r.label } : {}) });
  }
  return { model, warnings };
}
