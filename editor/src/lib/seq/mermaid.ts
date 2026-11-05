import { activationMarks, SeqBuilder } from './build';
import { SECTION_KEYWORD, type FragmentOp, type MessageKind, type ParticipantKind, type SeqItem, type SeqParseResult, type SequenceModel } from './types';

const ARROWS: [string, MessageKind][] = [['-->>', 'return'], ['->>', 'sync'], ['--)', 'async'], ['-)', 'async'], ['--x', 'destroy'], ['-x', 'destroy'], ['-->', 'return'], ['->', 'sync']];
const KINDS = new Set<ParticipantKind>(['participant', 'actor', 'boundary', 'control', 'entity', 'database']);
const MSG = /^([\w.]+)\s*(-->>|->>|--\)|-\)|--x|-x|-->|->)\s*([+-])?\s*([\w.]+)\s*:\s*(.*)$/;
const OPEN_WORDS: Record<string, FragmentOp> = { alt: 'alt', opt: 'opt', loop: 'loop', par: 'par', break: 'break', critical: 'critical', rect: 'rect' };
const COLOR = /^(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|transparent\b|(?:aqua|black|blue|fuchsia|gray|grey|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow|pink|cyan|brown|light(?:blue|green|grey|gray|yellow|pink))\b)\s*(.*)$/i;
const SECTION_WORDS = new Set(['else', 'and', 'option']);

const fromText = (s: string) => s.replace(/<br\s*\/?>/gi, '\n');
const toText = (s: string) => s.replace(/\r?\n/g, '<br/>');

export function parseSeqMermaid(src: string): SeqParseResult {
  const b = new SeqBuilder();
  for (const raw of src.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^sequenceDiagram\b/i.test(line) || /^title\b/i.test(line)) continue;
    if (/^autonumber\b/i.test(line)) { b.model.autonumber = true; continue; }
    let m = line.match(/^(?:(create)\s+)?(participant|actor)\s+([\w.]+)\s*(@\{[^}]*\})?\s*(?:as\s+(.+))?$/i);
    if (m) {
      const type = m[4]?.match(/"type"\s*:\s*"(\w+)"/)?.[1]?.toLowerCase();
      const kind: ParticipantKind = type && KINDS.has(type as ParticipantKind) ? (type as ParticipantKind) : m[2].toLowerCase() === 'actor' ? 'actor' : 'participant';
      b.declare(m[3], (m[5] ?? m[3]).trim(), kind);
      if (m[1]) b.pendingCreate.add(m[3]);
      continue;
    }
    if ((m = line.match(/^destroy\s+([\w.]+)$/i))) { b.pendingDestroy.add(m[1]); continue; }
    if ((m = line.match(/^(activate|deactivate)\s+([\w.]+)$/i))) {
      const last = b.lastMessage();
      if (last && m[1].toLowerCase() === 'activate' && last.kind !== 'sync') last.activate = true;
      else if (last && m[1].toLowerCase() === 'deactivate' && last.kind !== 'return') last.deactivate = true;
      continue;
    }
    if ((m = line.match(/^note\s+(over|left of|right of)\s+([\w.]+)(?:\s*,\s*([\w.]+))?\s*:\s*(.*)$/i))) {
      const side = m[1].toLowerCase().startsWith('left') ? 'left' : m[1].toLowerCase().startsWith('right') ? 'right' : 'over';
      b.note(m[3] ? [m[2], m[3]] : [m[2]], fromText(m[4]), side);
      continue;
    }
    if ((m = line.match(MSG))) {
      const kind = ARROWS.find(([a]) => a === m![2])![1];
      const sign = m[3];
      b.message(m[1], m[4], fromText(m[5]), kind, { activate: sign === '+' && kind !== 'sync', deactivate: sign === '-' && kind !== 'return' });
      continue;
    }
    if ((m = line.match(/^box\b\s*(.*)$/i))) {
      const c = m[1].match(COLOR);
      b.openBox((c ? c[2] : m[1]).trim(), c && c[1].toLowerCase() !== 'transparent' ? c[1] : undefined);
      continue;
    }
    if (/^end$/i.test(line) && b.inBox) { b.closeBox(); continue; }
    const word = line.match(/^(\w+)\b\s*(.*)$/);
    if (word) {
      const w = word[1].toLowerCase();
      if (OPEN_WORDS[w]) { b.open(OPEN_WORDS[w], word[2]); continue; }
      if (SECTION_WORDS.has(w)) { if (!b.section(word[2])) b.warnings.push(`"${w}" outside a fragment: ${line}`); continue; }
      if (w === 'end') { if (!b.end()) b.warnings.push('"end" without an open fragment'); continue; }
    }
    b.warnings.push(`Unrecognised line: ${line}`);
  }
  return b.finish();
}

export function renderSeqMermaid(model: SequenceModel): string {
  const idents = new Map<string, string>();
  const used = new Set<string>();
  model.participants.forEach((p, i) => {
    let base = /^[A-Za-z_]\w*$/.test(p.name) ? p.name : `P${i + 1}`;
    while (used.has(base)) base += '_';
    used.add(base);
    idents.set(p.id, base);
  });
  const created = new Set<string>();
  const scanCreated = (items: SeqItem[]) => { for (const it of items) { if (it.type === 'fragment') it.sections.forEach((s) => scanCreated(s.items)); else if (it.type === 'message' && it.kind === 'create') created.add(it.to); } };
  scanCreated(model.items);
  const decl = (p: SequenceModel['participants'][number]) => {
    const id = idents.get(p.id)!;
    const typed = p.kind !== 'participant' && p.kind !== 'actor' ? `@{ "type": "${p.kind}" }` : '';
    const word = p.kind === 'actor' ? 'actor' : 'participant';
    return `${word} ${id}${typed}${p.name !== id ? ` as ${p.name}` : ''}`;
  };
  const out = ['sequenceDiagram'];
  if (model.autonumber) out.push('  autonumber');
  const boxOf = new Map<string, NonNullable<SequenceModel['boxes']>[number]>();
  for (const bx of model.boxes ?? []) for (const id of bx.participants) boxOf.set(id, bx);
  let curBox: ReturnType<typeof boxOf.get>;
  for (const p of model.participants) {
    if (created.has(p.id)) continue;
    const bx = boxOf.get(p.id);
    if (bx !== curBox) {
      if (curBox) out.push('  end');
      if (bx) out.push(`  box ${[bx.color ?? (bx.label ? 'transparent' : ''), bx.label].filter(Boolean).join(' ')}`);
      curBox = bx;
    }
    out.push(`${curBox ? '    ' : '  '}${decl(p)}`);
  }
  if (curBox) out.push('  end');
  const marks = activationMarks(model.items);
  const done = new Set<string>();
  const emit = (items: SeqItem[], ind: string) => {
    for (const it of items) {
      if (it.type === 'message' && it.ext) {
        // Mermaid has no found / lost messages: keep the text as a note next to the lifeline
        const mk = marks.get(it.id);
        const who = idents.get(it.to);
        out.push(`${ind}Note ${it.ext === 'found' ? 'left of' : 'right of'} ${who}: ${it.ext}: ${toText(it.text)}`);
        if (mk?.open) out.push(`${ind}activate ${who}`);
      } else if (it.type === 'ref') {
        out.push(`${ind}Note over ${it.over.map((o) => idents.get(o)).join(',')}: ref: ${toText(it.text)}`);
      } else if (it.type === 'message') {
        if (it.kind === 'create' && !done.has(it.to)) { done.add(it.to); out.push(`${ind}create ${decl(model.participants.find((p) => p.id === it.to)!)}`); }
        const arrow = it.kind === 'return' ? '-->>' : it.kind === 'async' ? '-)' : it.kind === 'destroy' ? '-x' : '->>';
        const mk = marks.get(it.id);
        const sign = it.kind === 'destroy' || it.kind === 'create' ? '' : mk?.open ? '+' : mk?.close ? '-' : '';
        out.push(`${ind}${idents.get(it.from)}${arrow}${sign}${idents.get(it.to)}: ${toText(it.text)}`);
      } else if (it.type === 'note') {
        const who = it.over.map((o) => idents.get(o)).join(',');
        out.push(`${ind}Note ${it.side === 'left' ? 'left of' : it.side === 'right' ? 'right of' : 'over'} ${who}: ${toText(it.text)}`);
      } else {
        // Mermaid has no `group`: it becomes `opt`; `rect` is a single block
        const op = it.op === 'group' ? 'opt' : it.op;
        it.sections.forEach((s, i) => {
          if (it.op === 'rect' && i > 0) { emit(s.items, ind + '  '); return; }
          out.push(`${ind}${i === 0 ? op : SECTION_KEYWORD[it.op]}${s.guard ? ` ${s.guard}` : ''}`);
          emit(s.items, ind + '  ');
        });
        out.push(`${ind}end`);
      }
    }
  };
  emit(model.items, '  ');
  return out.join('\n') + '\n';
}
