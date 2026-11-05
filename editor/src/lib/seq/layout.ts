import { isFragment, isMessage, isNote, type FragmentOp, type MessageKind, type ParticipantKind, type SeqFragment, type SeqItem, type SeqMessage, type SequenceModel } from './types';

/** Metrics shared by the layout engine and the renderer. Nothing is measured from the DOM. */
export const SEQ = {
  pad: 24,
  titleH: 30,
  headGap: 12,
  headH: 56,
  boxH: 40,
  glyphH: 34,
  minBoxW: 84,
  charW: 6.8,
  minGap: 140,
  msgTop: 28,
  msgBottom: 16,
  selfLoopH: 26,
  selfLoopW: 36,
  createHalf: 20,
  noteLine: 16,
  noteW: 150,
  fragHead: 30,
  fragSection: 26,
  fragPad: 12,
  fragLevelPad: 12,
  actW: 10,
  actStep: 5,
  tail: 28,
  boxRow: 26,
  boxPad: 8,
  extMin: 70,
  refH: 46,
} as const;

export const textWidth = (s: string): number => Math.ceil(s.length * SEQ.charW);

export interface LaidParticipant {
  id: string;
  name: string;
  kind: ParticipantKind;
  /** lifeline x (centre) */
  x: number;
  boxX: number;
  boxW: number;
  boxTop: number;
  boxH: number;
  lifeTop: number;
  lifeBottom: number;
  destroyY?: number;
  created: boolean;
}
export interface LaidBox { id: string; label: string; color?: string; x: number; y: number; w: number; h: number }
export interface LaidRef { id: string; text: string; x: number; y: number; w: number; h: number }
export interface LaidMessage {
  id: string;
  kind: MessageKind;
  from: string;
  to: string;
  text: string;
  y: number;
  x1: number;
  x2: number;
  self: boolean;
  ext?: 'found' | 'lost';
  loopW: number;
  number?: number;
  /** label centre x */
  labelX: number;
}
export interface LaidNote { id: string; text: string; x: number; y: number; w: number; h: number; lines: string[] }
export interface LaidSection { id: string; guard: string; y: number; /** divider line (not for the first section) */ divider: boolean }
export interface LaidFragment { id: string; op: FragmentOp; x: number; y: number; w: number; h: number; level: number; depth: number; sections: LaidSection[] }
export interface LaidActivation { participantId: string; x: number; y1: number; y2: number; depth: number }
export interface SeqLayout {
  width: number;
  height: number;
  participants: LaidParticipant[];
  messages: LaidMessage[];
  notes: LaidNote[];
  refs: LaidRef[];
  boxes: LaidBox[];
  fragments: LaidFragment[];
  activations: LaidActivation[];
}

const headW = (name: string) => Math.max(SEQ.minBoxW, textWidth(name) + 24);
/** participants that draw as a pictogram above their name (UML actor, boundary, ...) */
export const isGlyph = (k: ParticipantKind): boolean => k !== 'participant';
export const headHeight = (k: ParticipantKind): number => (isGlyph(k) ? SEQ.glyphH + 20 : SEQ.boxH);

function noteLines(text: string, w: number): string[] {
  const per = Math.max(6, Math.floor((w - 16) / 6.6));
  const out: string[] = [];
  for (const raw of (text || ' ').split('\n')) {
    let line = '';
    for (const word of raw.split(/\s+/)) {
      if (line && (line + ' ' + word).length > per) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}
const noteWidth = (text: string, two: boolean): number => Math.min(240, Math.max(SEQ.noteW - 30, Math.max(...(text || ' ').split('\n').map((l) => l.length)) * 6.6 + 20, two ? 0 : 0));

/** max nesting of fragments below an item (a fragment without fragments inside is level 0) */
function levelOf(f: SeqFragment): number {
  let l = 0;
  for (const s of f.sections) for (const i of s.items) if (isFragment(i)) l = Math.max(l, levelOf(i) + 1);
  return l;
}

export function layoutSequence(model: SequenceModel): SeqLayout {
  const parts = model.participants;
  const idx = new Map(parts.map((p, i) => [p.id, i]));
  const boxW = parts.map((p) => headW(p.name));
  const n = parts.length;

  // ---- 1. horizontal: gaps grow with the widest label crossing them
  const gap: number[] = [];
  for (let i = 0; i < n - 1; i++) gap[i] = Math.max(SEQ.minGap, (boxW[i] + boxW[i + 1]) / 2 + 30);
  let tailExtra = 0;
  let maxFrag = 0;
  const demand = (a: number, b: number, need: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let k = lo; k < hi; k++) gap[k] = Math.max(gap[k], need / (hi - lo));
  };
  const scan = (items: SeqItem[], depth: number) => {
    for (const it of items) {
      if (isMessage(it)) {
        const a = idx.get(it.from), b = idx.get(it.to);
        if (a === undefined || b === undefined) continue;
        const lw = textWidth(it.text) + 30 + (model.autonumber ? 22 : 0);
        if (it.ext) {
          const len = Math.max(SEQ.extMin, lw);
          if (a < n - 1) gap[a] = Math.max(gap[a], len + 24);
          else if (a > 0) gap[a - 1] = Math.max(gap[a - 1], len + 24);
          else tailExtra = Math.max(tailExtra, len + 24);
        } else if (a === b) {
          const need = lw + SEQ.selfLoopW + 16;
          if (a < n - 1) gap[a] = Math.max(gap[a], need + boxW[a + 1] / 2 - 10);
          else tailExtra = Math.max(tailExtra, need);
        } else demand(a, b, lw);
      } else if (isNote(it) || it.type === 'ref') {
        const ids = it.over.map((o) => idx.get(o)).filter((v): v is number => v !== undefined);
        if (ids.length >= 2) demand(Math.min(...ids), Math.max(...ids), (it.type === 'ref' ? textWidth(it.text) + 40 : noteWidth(it.text, true)) - 20);
      } else {
        maxFrag = Math.max(maxFrag, depth + 1);
        for (const s of it.sections) scan(s.items, depth + 1);
      }
    }
  };
  scan(model.items, 0);
  const left = SEQ.pad + 28 + maxFrag * SEQ.fragLevelPad;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs[i] = i === 0 ? left + boxW[0] / 2 : xs[i - 1] + gap[i - 1];

  // ---- 2. vertical walk
  const hasBoxes = !!model.boxes?.some((b) => b.participants.some((id) => idx.has(id)));
  const top0 = SEQ.titleH + SEQ.headGap + (hasBoxes ? SEQ.boxRow : 0);
  let cur = top0 + SEQ.headH + 18;
  const lp: LaidParticipant[] = parts.map((p, i) => ({
    id: p.id, name: p.name, kind: p.kind, x: xs[i], boxX: xs[i] - boxW[i] / 2, boxW: boxW[i],
    boxTop: top0, boxH: headHeight(p.kind), lifeTop: top0 + headHeight(p.kind), lifeBottom: 0, created: false,
  }));
  const byId = new Map(lp.map((p) => [p.id, p]));
  const messages: LaidMessage[] = [];
  const notes: LaidNote[] = [];
  const refs: LaidRef[] = [];
  const fragments: LaidFragment[] = [];
  let counter = 0;
  const involved = (items: SeqItem[]): [number, number] => {
    let lo = Infinity, hi = -Infinity;
    const visit = (list: SeqItem[]) => {
      for (const it of list) {
        if (isFragment(it)) for (const s of it.sections) visit(s.items);
        else if (isMessage(it)) for (const id of [it.from, it.to]) { const k = idx.get(id); if (k !== undefined) { lo = Math.min(lo, k); hi = Math.max(hi, k); } }
        else for (const id of it.over) { const k = idx.get(id); if (k !== undefined) { lo = Math.min(lo, k); hi = Math.max(hi, k); } }
      }
    };
    visit(items);
    return lo === Infinity ? [0, Math.max(0, n - 1)] : [lo, hi];
  };
  const selfOut = (items: SeqItem[], k: number): number => {
    let w = 0;
    const visit = (list: SeqItem[]) => { for (const it of list) { if (isFragment(it)) it.sections.forEach((s) => visit(s.items)); else if (isMessage(it) && it.from === it.to && idx.get(it.from) === k) w = Math.max(w, SEQ.selfLoopW + textWidth(it.text) + 20); } };
    visit(items);
    return w;
  };

  const walkItems = (items: SeqItem[], depth: number) => {
    for (const it of items) {
      if (isMessage(it)) {
        const a = byId.get(it.from), b = byId.get(it.to);
        if (!a || !b) continue;
        const self = a === b && !it.ext;
        const created = it.kind === 'create' && !self;
        const y = cur + (created ? SEQ.createHalf + 14 : SEQ.msgTop);
        let x1 = a.x, x2 = b.x;
        if (created) {
          b.created = true;
          b.boxTop = y - b.boxH / 2;
          b.lifeTop = b.boxTop + b.boxH;
          x2 = b.x + (b.x > a.x ? -1 : 1) * b.boxW / 2;
        }
        if (it.kind === 'destroy' && !self && !it.ext) b.destroyY = y;
        if (self) { x1 = a.x; x2 = a.x; }
        if (it.ext) {
          const i = idx.get(it.to)!;
          const dir = i < n - 1 || i === 0 ? 1 : -1;
          const len = Math.max(SEQ.extMin, textWidth(it.text) + 30 + (model.autonumber ? 22 : 0));
          if (it.ext === 'found') { x1 = a.x + dir * len; x2 = a.x; } else { x1 = a.x; x2 = a.x + dir * len; }
        }
        const num = model.autonumber ? ++counter : undefined;
        messages.push({ id: it.id, kind: it.kind, from: it.from, to: it.to, text: it.text, y, x1, x2, self, ...(it.ext ? { ext: it.ext } : {}), loopW: self ? SEQ.selfLoopW : 0, number: num, labelX: self ? a.x + SEQ.selfLoopW + 8 : (x1 + x2) / 2 });
        cur = y + (self ? SEQ.selfLoopH + 14 : created ? SEQ.createHalf + 6 : SEQ.msgBottom);
      } else if (it.type === 'ref') {
        const ks = it.over.map((o) => idx.get(o)).filter((v): v is number => v !== undefined);
        if (!ks.length) continue;
        const c1 = xs[Math.min(...ks)], c2 = xs[Math.max(...ks)];
        const w = Math.max(c2 - c1 + 60, textWidth(it.text) + 40, 110);
        const y = cur + 6;
        refs.push({ id: it.id, text: it.text, x: (c1 + c2) / 2 - w / 2, y, w, h: SEQ.refH });
        cur = y + SEQ.refH + 10;
      } else if (isNote(it)) {
        const ks = it.over.map((o) => idx.get(o)).filter((v): v is number => v !== undefined);
        if (!ks.length) continue;
        const two = ks.length === 2;
        let w = noteWidth(it.text, two);
        let x: number;
        if (two) { const c1 = xs[Math.min(...ks)], c2 = xs[Math.max(...ks)]; w = Math.max(w, c2 - c1 + 40); x = (c1 + c2) / 2 - w / 2; }
        else if (it.side === 'left') x = xs[ks[0]] - w - 12;
        else if (it.side === 'right') x = xs[ks[0]] + 12;
        else x = xs[ks[0]] - w / 2;
        const lines = noteLines(it.text, w);
        const h = lines.length * SEQ.noteLine + 14;
        const y = cur + 8;
        notes.push({ id: it.id, text: it.text, x, y, w, h, lines });
        cur = y + h + 10;
      } else {
        const y0 = cur + 6;
        const lvl = levelOf(it);
        const slot: LaidFragment = { id: it.id, op: it.op, x: 0, y: y0, w: 0, h: 0, level: lvl, depth, sections: [] };
        fragments.push(slot);
        cur = y0 + SEQ.fragHead;
        it.sections.forEach((s, si) => {
          if (si > 0) { slot.sections.push({ id: s.id, guard: s.guard, y: cur + 4, divider: true }); cur += SEQ.fragSection; }
          else slot.sections.push({ id: s.id, guard: s.guard, y: y0, divider: false });
          walkItems(s.items, depth + 1);
        });
        cur += SEQ.fragPad;
        slot.h = cur - y0;
        const [lo, hi] = involved([it]);
        const pad = 30 + lvl * SEQ.fragLevelPad;
        slot.x = xs[lo] - pad;
        slot.w = xs[hi] + pad - slot.x + Math.max(0, selfOut([it], hi) - 20);
        cur += 8;
      }
    }
  };
  walkItems(model.items, 0);

  // ---- 3. lifelines, activations
  const end = cur + SEQ.tail;
  for (const p of lp) p.lifeBottom = p.destroyY ?? end;
  const stacks = new Map<string, { y: number; depth: number }[]>();
  const activations: LaidActivation[] = [];
  const close = (pid: string, y: number) => {
    const st = stacks.get(pid);
    const top = st?.pop();
    if (top) activations.push({ participantId: pid, x: byId.get(pid)!.x - SEQ.actW / 2 + top.depth * SEQ.actStep, y1: top.y, y2: Math.max(y, top.y + 12), depth: top.depth });
  };
  const open = (pid: string, y: number) => {
    const st = stacks.get(pid) ?? [];
    st.push({ y, depth: st.length });
    stacks.set(pid, st);
  };
  const flat: SeqMessage[] = [];
  const collect = (items: SeqItem[]) => { for (const it of items) { if (isMessage(it)) flat.push(it); else if (isFragment(it)) it.sections.forEach((s) => collect(s.items)); } };
  collect(model.items);
  for (const m of flat) {
    const lm = messages.find((x) => x.id === m.id);
    if (!lm) continue;
    if (m.kind === 'return') close(m.from, lm.y);
    else {
      if ((m.kind === 'sync' || m.activate) && m.ext !== 'lost') open(m.to, lm.y);
      if (m.deactivate) close(m.from, lm.y);
    }
  }
  const lastY = messages.length ? messages[messages.length - 1].y : end;
  for (const pid of stacks.keys()) while (stacks.get(pid)!.length) close(pid, lastY + 14);
  activations.sort((a, b) => a.y1 - b.y1 || a.depth - b.depth);

  const boxes: LaidBox[] = [];
  for (const b of model.boxes ?? []) {
    const ms = b.participants.map((id) => byId.get(id)).filter((p): p is LaidParticipant => !!p);
    if (!ms.length) continue;
    const x = Math.min(...ms.map((p) => p.boxX)) - SEQ.boxPad;
    const hh = Math.max(...ms.map((p) => headHeight(p.kind)));
    boxes.push({ id: b.id, label: b.label, ...(b.color ? { color: b.color } : {}), x, y: SEQ.titleH + 4, w: Math.max(...ms.map((p) => p.boxX + p.boxW)) + SEQ.boxPad - x, h: top0 - (SEQ.titleH + 4) + hh + 6 });
  }
  const rightMost = n ? xs[n - 1] + boxW[n - 1] / 2 : 0;
  const frag = fragments.reduce((m, f) => Math.max(m, f.x + f.w), 0);
  const width = n ? Math.ceil(Math.max(rightMost + SEQ.pad + 28 + maxFrag * SEQ.fragLevelPad, xs[n - 1] + tailExtra + SEQ.pad, frag + SEQ.pad, ...notes.map((x) => x.x + x.w + SEQ.pad), ...refs.map((x) => x.x + x.w + SEQ.pad))) : 240;
  const height = Math.ceil(n ? end + SEQ.pad : top0 + SEQ.headH + 60);
  return { width, height, participants: lp, messages, notes, refs, boxes, fragments, activations };
}
