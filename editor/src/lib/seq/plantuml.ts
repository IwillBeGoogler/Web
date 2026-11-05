import { activationMarks, SeqBuilder } from './build';
import { SECTION_KEYWORD, type FragmentOp, type MessageKind, type ParticipantKind, type SeqItem, type SeqParseResult, type SequenceModel } from './types';

const KIND_WORDS: Record<string, ParticipantKind> = { participant: 'participant', actor: 'actor', boundary: 'boundary', control: 'control', entity: 'entity', database: 'database', collections: 'entity', queue: 'participant' };
const NAME = String.raw`"[^"]+"|[\w.]+`;
const unq = (s: string) => s.replace(/^"|"$/g, '');
const DECL = new RegExp(String.raw`^(create\s+)?(${Object.keys(KIND_WORDS).join('|')})\s+(${NAME})(?:\s+as\s+(${NAME}))?(?:\s+(?:#\w+|<<.*?>>))*\s*$`, 'i');
const MSG = new RegExp(String.raw`^(${NAME})\s*(<{0,2}-+(?:>{1,2}|x)?|<{1,2}-+)\s*(${NAME})\s*(!!)?\s*(?::\s*(.*))?$`);
const OPEN: Record<string, FragmentOp> = { alt: 'alt', opt: 'opt', loop: 'loop', par: 'par', break: 'break', critical: 'critical', group: 'group' };
const IGNORED = /^(skinparam|hide|show|!|title|header|footer|legend|participant\s*$|\.\.\.|\|\|\||==|newpage)/i;

function classify(arrow: string): { kind: MessageKind; reverse: boolean } {
  const reverse = arrow.startsWith('<');
  const a = arrow.replace(/[<>]/g, (c) => c);
  if (/x$/.test(a)) return { kind: 'destroy', reverse };
  const dashed = (a.match(/-/g) ?? []).length >= 2;
  const async = a.includes('>>') || a.includes('<<');
  return { kind: async ? 'async' : dashed ? 'return' : 'sync', reverse };
}

export function parseSeqPlantUml(src: string): SeqParseResult {
  const b = new SeqBuilder();
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line)) continue;
    if (/^autonumber\b/i.test(line)) { b.model.autonumber = true; continue; }
    if (IGNORED.test(line)) continue;
    let m = line.match(DECL);
    if (m) {
      const kind = KIND_WORDS[m[2].toLowerCase()];
      // `participant "Long name" as L` and `participant L as "Long name"` both occur
      const first = unq(m[3]), second = m[4] ? unq(m[4]) : undefined;
      const quotedFirst = m[3].startsWith('"');
      const ident = second ? (quotedFirst ? second : first) : first;
      const name = second ? (quotedFirst ? first : second) : first;
      b.declare(ident, name, kind);
      if (m[1]) b.pendingCreate.add(ident);
      continue;
    }
    if ((m = line.match(/^create\s+(\S+)$/i))) { b.pendingCreate.add(unq(m[1])); continue; }
    if ((m = line.match(/^destroy\s+(\S+)$/i))) { b.pendingDestroy.add(unq(m[1])); continue; }
    if ((m = line.match(/^(activate|deactivate)\s+(\S+)/i))) {
      const last = b.lastMessage();
      if (last && m[1].toLowerCase() === 'activate' && last.kind !== 'sync') last.activate = true;
      else if (last && m[1].toLowerCase() === 'deactivate' && last.kind !== 'return') last.deactivate = true;
      continue;
    }
    if ((m = line.match(/^(?:r?note)\s+(over|left of|right of|left|right)\s+(.+?)\s*(?::\s*(.*))?$/i))) {
      const side = m[1].toLowerCase().startsWith('left') ? 'left' : m[1].toLowerCase().startsWith('right') ? 'right' : 'over';
      const who = m[2].split(',').map((s) => unq(s.trim())).slice(0, 2);
      let text = m[3];
      if (text === undefined) {
        const body: string[] = [];
        while (i + 1 < lines.length && !/^end\s*r?note/i.test(lines[i + 1].trim())) body.push(lines[++i].trim());
        i++;
        text = body.join('\n');
      }
      b.note(who, text.replace(/\\n/g, '\n'), side);
      continue;
    }
    if ((m = line.match(new RegExp(String.raw`^(?:\[|\?)(-+>{1,2})\s*(${NAME})\s*(?::\s*(.*))?$`)))) {
      b.external(unq(m[2]), (m[3] ?? '').replace(/\\n/g, '\n'), 'found', classify(m[1]).kind);
      continue;
    }
    if ((m = line.match(new RegExp(String.raw`^(${NAME})\s*(-+>{1,2})(?:\]|\?)\s*(?::\s*(.*))?$`)))) {
      b.external(unq(m[1]), (m[3] ?? '').replace(/\\n/g, '\n'), 'lost', classify(m[2]).kind);
      continue;
    }
    if ((m = line.match(/^box\b\s*(.*)$/i))) {
      const color = m[1].match(/#\w+\s*$/)?.[0].trim();
      b.openBox(unq((color ? m[1].slice(0, m[1].lastIndexOf(color)) : m[1]).trim()), color);
      continue;
    }
    if (/^end\s*box\b/i.test(line)) { if (!b.closeBox()) b.warnings.push('"end box" without an open box'); continue; }
    if ((m = line.match(/^ref\s+over\s+(.+?)\s*(?::\s*(.*))?$/i))) {
      let text = m[2];
      if (text === undefined) {
        const body: string[] = [];
        while (i + 1 < lines.length && !/^end\s*ref/i.test(lines[i + 1].trim())) body.push(lines[++i].trim());
        i++;
        text = body.join('\n');
      }
      b.refFrame(m[1].split(',').map((x) => unq(x.trim())), text.replace(/\\n/g, '\n'));
      continue;
    }
    if ((m = line.match(MSG))) {
      const { kind, reverse } = classify(m[2]);
      const [a, c] = reverse ? [unq(m[3]), unq(m[1])] : [unq(m[1]), unq(m[3])];
      b.message(a, c, (m[5] ?? '').replace(/\\n/g, '\n'), m[4] ? 'destroy' : kind);
      continue;
    }
    const word = line.match(/^(\w+)\b\s*(.*)$/);
    if (word) {
      const w = word[1].toLowerCase();
      if (OPEN[w]) { b.open(OPEN[w], word[2]); continue; }
      if (w === 'else' || w === 'and' || w === 'option') { if (!b.section(word[2])) b.warnings.push(`"${w}" outside a fragment: ${line}`); continue; }
      if (w === 'end' && b.inBox) { b.closeBox(); continue; }
      if (w === 'end') { if (!b.end()) b.warnings.push('"end" without an open fragment'); continue; }
    }
    b.warnings.push(`Unrecognised line: ${line}`);
  }
  return b.finish();
}

export function renderSeqPlantUml(model: SequenceModel): string {
  const idents = new Map<string, string>();
  const used = new Set<string>();
  model.participants.forEach((p, i) => {
    let base = /^[A-Za-z_]\w*$/.test(p.name) ? p.name : `P${i + 1}`;
    while (used.has(base)) base += '_';
    used.add(base);
    idents.set(p.id, base);
  });
  const created = new Set<string>();
  const scan = (items: SeqItem[]) => { for (const it of items) { if (it.type === 'fragment') it.sections.forEach((s) => scan(s.items)); else if (it.type === 'message' && it.kind === 'create') created.add(it.to); } };
  scan(model.items);
  const decl = (p: SequenceModel['participants'][number]) => {
    const id = idents.get(p.id)!;
    return p.name === id ? `${p.kind} ${id}` : `${p.kind} "${p.name}" as ${id}`;
  };
  const out = ['@startuml'];
  if (model.autonumber) out.push('autonumber');
  const boxOf = new Map<string, NonNullable<SequenceModel['boxes']>[number]>();
  for (const bx of model.boxes ?? []) for (const id of bx.participants) boxOf.set(id, bx);
  let curBox: ReturnType<typeof boxOf.get>;
  for (const p of model.participants) {
    if (created.has(p.id)) continue;
    const bx = boxOf.get(p.id);
    if (bx !== curBox) {
      if (curBox) out.push('end box');
      if (bx) out.push(`box ${bx.label ? `"${bx.label}"` : ''}${bx.color ? ` ${bx.color}` : ''}`.trimEnd());
      curBox = bx;
    }
    out.push(`${curBox ? '  ' : ''}${decl(p)}`);
  }
  if (curBox) out.push('end box');
  const marks = activationMarks(model.items);
  const done = new Set<string>();
  const emit = (items: SeqItem[], ind: string) => {
    for (const it of items) {
      if (it.type === 'message' && it.ext) {
        const arrow = it.kind === 'return' ? '-->' : it.kind === 'async' ? '->>' : '->';
        const who = idents.get(it.to);
        out.push(it.ext === 'found' ? `${ind}[${arrow} ${who} : ${it.text.replace(/\n/g, '\\n')}` : `${ind}${who} ${arrow}] : ${it.text.replace(/\n/g, '\\n')}`);
        if (marks.get(it.id)?.open) out.push(`${ind}activate ${who}`);
      } else if (it.type === 'ref') {
        out.push(`${ind}ref over ${it.over.map((o) => idents.get(o)).join(', ')} : ${it.text.replace(/\n/g, '\\n')}`);
      } else if (it.type === 'message') {
        if (it.kind === 'create' && !done.has(it.to)) { done.add(it.to); out.push(`${ind}create ${decl(model.participants.find((p) => p.id === it.to)!)}`); }
        const arrow = it.kind === 'return' ? '-->' : it.kind === 'async' ? '->>' : '->';
        out.push(`${ind}${idents.get(it.from)} ${arrow} ${idents.get(it.to)}${it.kind === 'destroy' ? ' !!' : ''} : ${it.text.replace(/\n/g, '\\n')}`);
        const mk = marks.get(it.id);
        if (mk?.open) out.push(`${ind}activate ${idents.get(it.to)}`);
        if (mk?.close) out.push(`${ind}deactivate ${idents.get(it.from)}`);
      } else if (it.type === 'note') {
        out.push(`${ind}note ${it.side === 'left' ? 'left of' : it.side === 'right' ? 'right of' : 'over'} ${it.over.map((o) => idents.get(o)).join(', ')} : ${it.text.replace(/\n/g, '\\n')}`);
      } else if (it.op === 'rect') {
        // PlantUML has no background-only block: keep the content, drop the highlight
        out.push(`${ind}' rect ${it.sections[0]?.guard ?? ''}`.trimEnd());
        it.sections.forEach((s) => emit(s.items, ind));
      } else {
        it.sections.forEach((s, i) => {
          out.push(`${ind}${i === 0 ? it.op : SECTION_KEYWORD[it.op]}${s.guard ? ` ${s.guard}` : ''}`);
          emit(s.items, ind + '  ');
        });
        out.push(`${ind}end`);
      }
    }
  };
  emit(model.items, '');
  out.push('@enduml');
  return out.join('\n') + '\n';
}
