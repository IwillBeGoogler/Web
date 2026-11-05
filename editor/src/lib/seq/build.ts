import { idMaker, type SeqBox, type FragmentOp, type MessageKind, type ParticipantKind, type SeqFragment, type SeqItem, type SeqNote, type SeqParseResult } from './types';

/** Shared by the Mermaid and PlantUML parsers: identifiers -> participants, a stack of open fragments, pending create / destroy. */
export class SeqBuilder {
  private id = idMaker();
  private byIdent = new Map<string, string>();
  readonly model: SeqParseResult['model'] = { participants: [], items: [], autonumber: false };
  readonly warnings: string[] = [];
  private stack: SeqFragment[] = [];
  pendingCreate = new Set<string>();
  pendingDestroy = new Set<string>();
  private box: SeqBox | undefined;

  declare(ident: string, name: string, kind: ParticipantKind): string {
    const known = this.byIdent.get(ident);
    if (known) {
      const p = this.model.participants.find((x) => x.id === known)!;
      p.name = name; p.kind = kind;
      return known;
    }
    const id = this.id('p');
    this.byIdent.set(ident, id);
    this.model.participants.push({ id, name, kind });
    this.box?.participants.push(id);
    return id;
  }
  ref(ident: string): string {
    return this.byIdent.get(ident) ?? this.declare(ident, ident, 'participant');
  }
  /** start a participant group; participants declared until `closeBox` join it */
  openBox(label: string, color?: string): void {
    this.box = { id: this.id('b'), label, ...(color ? { color } : {}), participants: [] };
    (this.model.boxes ??= []).push(this.box);
  }
  closeBox(): boolean {
    if (!this.box) return false;
    this.box = undefined;
    return true;
  }
  get inBox(): boolean { return !!this.box; }
  has(ident: string): boolean { return this.byIdent.has(ident); }
  private items(): SeqItem[] {
    const top = this.stack[this.stack.length - 1];
    return top ? top.sections[top.sections.length - 1].items : this.model.items;
  }
  message(from: string, to: string, text: string, kind: MessageKind, extra: { activate?: boolean; deactivate?: boolean } = {}): void {
    const f = this.ref(from), t = this.ref(to);
    let k = kind;
    if (this.pendingCreate.delete(to) && k !== 'destroy') k = 'create';
    if (this.pendingDestroy.delete(to) && f !== t) k = 'destroy';
    this.items().push({ type: 'message', id: this.id('m'), from: f, to: t, text, kind: k, ...(extra.activate ? { activate: true } : {}), ...(extra.deactivate ? { deactivate: true } : {}) });
  }
  /** found / lost message: `ident` is the lifeline at the inner end */
  external(ident: string, text: string, ext: 'found' | 'lost', kind: MessageKind = 'sync'): void {
    const p = this.ref(ident);
    this.items().push({ type: 'message', id: this.id('m'), from: p, to: p, text, kind, ext });
  }
  refFrame(idents: string[], text: string): void {
    this.items().push({ type: 'ref', id: this.id('r'), text, over: idents.map((i) => this.ref(i)) });
  }
  note(idents: string[], text: string, side?: SeqNote['side']): void {
    const note: SeqNote = { type: 'note', id: this.id('n'), text, over: idents.map((i) => this.ref(i)), ...(side && side !== 'over' ? { side } : {}) };
    this.items().push(note);
  }
  open(op: FragmentOp, guard: string): void {
    const f: SeqFragment = { type: 'fragment', id: this.id('f'), op, sections: [{ id: this.id('s'), guard, items: [] }] };
    this.items().push(f);
    this.stack.push(f);
  }
  section(guard: string): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    top.sections.push({ id: this.id('s'), guard, items: [] });
    return true;
  }
  end(): boolean { return !!this.stack.pop(); }
  get depth(): number { return this.stack.length; }
  /** last message in the current list (used by activate / deactivate statements) */
  lastMessage() {
    const l = this.items()[this.items().length - 1];
    return l && l.type === 'message' ? l : undefined;
  }
  finish(): SeqParseResult {
    while (this.stack.length) { this.stack.pop(); this.warnings.push('Unclosed fragment (missing "end")'); }
    return { model: this.model, warnings: this.warnings };
  }
}

/** Simulates the activation stacks like the layout does, to decide where "+" / "-" shorthand may be written. */
export function activationMarks(items: SeqItem[]): Map<string, { open: boolean; close: boolean }> {
  const out = new Map<string, { open: boolean; close: boolean }>();
  const depth = new Map<string, number>();
  const visit = (list: SeqItem[]) => {
    for (const it of list) {
      if (it.type === 'fragment') { it.sections.forEach((s) => visit(s.items)); continue; }
      if (it.type !== 'message') continue;
      if (it.ext === 'lost') { out.set(it.id, { open: false, close: false }); continue; }
      let open = false, close = false;
      if (it.kind === 'return') { if ((depth.get(it.from) ?? 0) > 0) { depth.set(it.from, depth.get(it.from)! - 1); close = true; } }
      else {
        if (it.kind === 'sync' || it.activate) { depth.set(it.to, (depth.get(it.to) ?? 0) + 1); open = true; }
        if (it.deactivate && (depth.get(it.from) ?? 0) > 0) { depth.set(it.from, depth.get(it.from)! - 1); close = true; }
      }
      out.set(it.id, { open, close });
    }
  };
  visit(items);
  return out;
}
