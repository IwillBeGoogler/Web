import { backEdges } from './layout';
import { emptyActivityModel, type ActFlow, type ActNode, type ActivityKind, type ActivityModel } from './types';

const oneLine = (s: string) => s.replace(/\n/g, '\\n');

/** activity diagram as PlantUML (new syntax): structured `if` / `switch` / `while` / `repeat` / `fork` blocks are rebuilt from the flows. */
export function renderActivityPlantuml(model: ActivityModel): string {
  const lines = ['@startuml'];
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const laneName = new Map(model.lanes.map((l) => [l.id, l.name]));
  const real = model.nodes.filter((n) => n.kind !== 'note');
  const flows = model.flows.filter((f) => !f.note && byId.has(f.from) && byId.has(f.to) && byId.get(f.from)!.kind !== 'note' && byId.get(f.to)!.kind !== 'note');
  const back = backEdges(real.map((n) => n.id), flows);
  const fwd = new Map<string, ActFlow[]>(), bak = new Map<string, ActFlow[]>(), inc = new Map<string, number>();
  flows.forEach((f, i) => {
    const m = back.has(i) ? bak : fwd;
    if (!m.has(f.from)) m.set(f.from, []);
    m.get(f.from)!.push(f);
    inc.set(f.to, (inc.get(f.to) ?? 0) + 1);
  });
  const notes = new Map<string, string[]>();
  for (const f of model.flows) {
    if (!f.note) continue;
    const a = byId.get(f.from), b = byId.get(f.to);
    const note = a?.kind === 'note' ? a : b?.kind === 'note' ? b : undefined;
    const target = note === a ? b : a;
    if (note && target && target.kind !== 'note') notes.set(target.id, [...(notes.get(target.id) ?? []), note.name]);
  }
  const outs = (id: string) => fwd.get(id) ?? [];
  const reach = (start: string) => {
    const seen = [start];
    for (let i = 0; i < seen.length; i++) for (const f of outs(seen[i])) if (!seen.includes(f.to)) seen.push(f.to);
    return seen;
  };
  const merge = (starts: string[]) => {
    const sets = starts.map((s) => new Set(reach(s)));
    return reach(starts[0]).find((x) => sets.every((s) => s.has(x)));
  };
  const reachesBack = (start: string, target: string) => reach(start).some((x) => (bak.get(x) ?? []).some((f) => f.to === target));

  const visited = new Set<string>();
  let lane: string | undefined;
  const emit = (s: string, d: number) => lines.push('  '.repeat(d) + s);
  const repeats: string[] = [];
  const g = (s?: string) => (s ? ` (${oneLine(s)})` : '');

  const noteLines = (n: ActNode, d: number) => { for (const text of notes.get(n.id) ?? []) emit(`note right: ${oneLine(text)}`, d); };
  const emitNode = (n: ActNode, d: number) => {
    if (n.lane && n.lane !== lane && laneName.has(n.lane)) { lane = n.lane; emit(`|${laneName.get(n.lane)}|`, d); }
    const t = oneLine(n.name);
    switch (n.kind) {
      case 'initial': emit('start', d); break;
      case 'final': emit('stop', d); break;
      case 'flowFinal': emit('end', d); break;
      case 'object': emit(`:${t}${n.state ? ` [${n.state}]` : ''}]`, d); break;
      case 'send': emit(`:${t}>`, d); break;
      case 'accept': emit(`:${t}<`, d); break;
      default: emit(`:${t};`, d);
    }
    noteLines(n, d);
  };

  const walk = (startId: string | undefined, stop: Set<string>, d: number): void => {
    let id = startId;
    while (id && !stop.has(id)) {
      const n = byId.get(id)!;
      if (visited.has(id)) { emit(`' continues at "${oneLine(n.name || n.kind)}"`, d); return; }
      visited.add(id);
      const o = outs(id);
      const loopBack = (bak.get(id) ?? []).find((f) => repeats.includes(f.to));
      if (n.kind === 'decision' || n.kind === 'fork') {
        if (n.kind === 'decision' && loopBack && o.length === 1) {
          // closes a `repeat`
          repeats.pop();
          emit(`repeat while (${oneLine(n.name)})${loopBack.guard ? ` is (${oneLine(loopBack.guard)})` : ''}${o[0].guard ? ` not (${oneLine(o[0].guard)})` : ''}`, d);
          noteLines(n, d);
          id = o[0].to;
          continue;
        }
        if (n.kind === 'decision' && o.length >= 2 && inc.get(id) && flows.some((f, i) => back.has(i) && f.to === id)) {
          // `while` loop: the body is the branch that comes back here
          const body = o.find((f) => reachesBack(f.to, id!)) ?? o[0];
          const exit = o.find((f) => f !== body);
          emit(`while (${oneLine(n.name)})${body.guard ? ` is (${oneLine(body.guard)})` : ''}`, d);
          noteLines(n, d + 1);
          walk(body.to, new Set([id]), d + 1);
          emit(`endwhile${g(exit?.guard)}`, d);
          id = exit?.to;
          continue;
        }
        if (n.kind === 'decision' && o.length === 1 && flows.some((f, i) => back.has(i) && f.to === id)) {
          repeats.push(id);
          emit('repeat', d);
          id = o[0].to;
          continue;
        }
        if (o.length >= 2) {
          const join = merge(o.map((f) => f.to));
          const inner = new Set(join ? [join] : []);
          if (n.kind === 'fork') {
            emit('fork', d);
            noteLines(n, d + 1);
            o.forEach((f, i) => { if (i) emit('fork again', d); walk(f.to, inner, d + 1); });
            emit('end fork', d);
          } else if (o.length === 2) {
            emit(`if (${oneLine(n.name)}) then${g(o[0].guard)}`, d);
            noteLines(n, d + 1);
            walk(o[0].to, inner, d + 1);
            if (!(join === o[1].to && !o[1].guard)) {
              emit(`else${g(o[1].guard)}`, d);
              walk(o[1].to, inner, d + 1);
            }
            emit('endif', d);
          } else {
            emit(`switch (${oneLine(n.name)})`, d);
            noteLines(n, d + 1);
            for (const f of o) { emit(`case${g(f.guard)}`, d); walk(f.to, inner, d + 1); }
            emit('endswitch', d);
          }
          id = join;
          continue;
        }
        // merge / join with a single way out
        if (o[0]?.guard) emit(`-> ${oneLine(o[0].guard)};`, d);
        id = o[0]?.to;
        continue;
      }
      emitNode(n, d);
      if (n.kind === 'final' || n.kind === 'flowFinal') return;
      if (o.length > 1) {
        const join = merge(o.map((f) => f.to));
        emit('fork', d);
        o.forEach((f, i) => { if (i) emit('fork again', d); walk(f.to, new Set(join ? [join] : []), d + 1); });
        emit('end fork', d);
        id = join;
        continue;
      }
      if (o[0]?.guard) emit(`-> ${oneLine(o[0].guard)};`, d);
      id = o[0]?.to;
    }
  };

  const roots = [...real.filter((n) => n.kind === 'initial'), ...real.filter((n) => n.kind !== 'initial' && !inc.get(n.id))];
  roots.forEach((r, i) => { if (!visited.has(r.id)) { if (i) emit('', 0); walk(r.id, new Set(), 0); } });
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

export const looksLikeActivityPlantuml = (text: string): boolean => {
  if (!/@startuml/i.test(text)) return false;
  if (/^\s*(participant|class|enum|interface|state|component|node|artifact|usecase|boundary|control|entity|alt|opt|activate|autonumber|actor|database)\b/im.test(text)) return false;
  return /^\s*:[^\n]*[;|<>\]/}]\s*$/m.test(text) || (/^\s*start\s*$/im.test(text) && /^\s*(stop|end|if\b|fork\b|while\b|repeat\b|switch\b|:)/im.test(text));
};

interface Tail { id: string; guard?: string }
interface Frame { kind: 'if' | 'fork' | 'while' | 'repeat' | 'switch'; head?: string; cur?: string; ends: Tail[]; hasElse?: boolean; started?: boolean; yes?: string }

/** Parse the activity subset of new-syntax PlantUML: start / stop / end, `:action;` (also `<` `>` `]` ends), if / elseif / else, switch, while, repeat, fork / split, `|Lane|`, partition, note, `-> guard;`. */
export function parseActivityPlantuml(text: string): { model: ActivityModel; warnings: string[] } {
  const model = emptyActivityModel();
  const warnings: string[] = [];
  let n = 0;
  let tails: Tail[] = [];
  let lane: string | undefined;
  let last: string | undefined;
  const laneStack: (string | undefined)[] = [];
  const frames: Frame[] = [];
  const laneId = (name: string) => {
    let l = model.lanes.find((x) => x.name === name);
    if (!l) { l = { id: `l${model.lanes.length + 1}`, name }; model.lanes.push(l); }
    return l.id;
  };
  const link = (id: string) => {
    for (const t of tails) model.flows.push({ from: t.id, to: id, ...(t.guard ? { guard: t.guard } : {}) });
    tails = [{ id }];
    last = id;
  };
  const add = (name: string, kind: ActivityKind, extra: Partial<ActNode> = {}): string => {
    const id = `n${++n}`;
    model.nodes.push({ id, name, kind, ...(lane ? { lane } : {}), ...extra });
    link(id);
    return id;
  };
  /** the paths of a finished block meet in a merge / join node (none when only one path is left) */
  const close = (ends: Tail[], kind: 'decision' | 'fork') => {
    if (ends.length === 0) { tails = []; return; }
    if (ends.length === 1) { tails = ends; return; }
    tails = ends;
    add('', kind);
  };
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line) || /^(title|skinparam|hide|legend|header|footer|scale|left to right direction|top to bottom direction)\b/i.test(line)) continue;
    let m: RegExpMatchArray | null;
    if (/^start$/i.test(line)) { add('', 'initial'); continue; }
    if (/^stop$/i.test(line)) { add('', 'final'); tails = []; continue; }
    if (/^end$/i.test(line)) { add('', 'flowFinal'); tails = []; continue; }
    if (/^kill$/i.test(line)) { add('', 'flowFinal'); tails = []; continue; }
    if (/^detach$/i.test(line)) { tails = []; continue; }
    if ((m = line.match(/^\|(?:#[^|]*\|)?([^|]+)\|$/))) { lane = laneId(m[1].trim()); continue; }
    if ((m = line.match(/^partition\s+"?(.+?)"?\s*\{$/i))) { laneStack.push(lane); lane = laneId(m[1].trim()); continue; }
    if (line === '}') { if (laneStack.length) lane = laneStack.pop(); continue; }
    if (line.startsWith(':')) {
      while (!/[;|<>\]/}]$/.test(line) && i + 1 < lines.length) line += '\n' + lines[++i].trim();
      const t = line.match(/^:([\s\S]*?)([;|<>\]/}])$/);
      if (!t) { warnings.push(`Skipped: ${line}`); continue; }
      let name = t[1].trim().replace(/\\n/g, '\n').replace(/\n+/g, '\n');
      const kind: ActivityKind = t[2] === '<' ? 'accept' : t[2] === '>' ? 'send' : t[2] === ']' ? 'object' : 'action';
      let state: string | undefined;
      if (kind === 'object') { const s = name.match(/^(.*?)\s*\[([^\]]*)\]$/); if (s) { name = s[1]; state = s[2]; } }
      add(name, kind, state ? { state } : {});
      continue;
    }
    if ((m = line.match(/^->\s*(.*?);?$/))) { const guard = m[1].trim(); if (guard) tails = tails.map((t) => ({ ...t, guard: t.guard ?? guard })); continue; }
    if ((m = line.match(/^if\s*\((.*)\)\s*then\s*(?:\((.*)\))?\s*$/i))) {
      const d = add(m[1].trim(), 'decision');
      frames.push({ kind: 'if', cur: d, ends: [] });
      tails = [{ id: d, ...(m[2]?.trim() ? { guard: m[2].trim() } : {}) }];
      continue;
    }
    if ((m = line.match(/^elseif\s*\((.*)\)\s*(?:then\s*)?(?:\((.*)\))?\s*$/i))) {
      const f = frames[frames.length - 1];
      if (f?.kind !== 'if') { warnings.push(`Skipped: ${line}`); continue; }
      f.ends.push(...tails);
      const prev = f.cur!;
      tails = [{ id: prev }];
      const d = add(m[1].trim(), 'decision');
      f.cur = d;
      tails = [{ id: d, ...(m[2]?.trim() ? { guard: m[2].trim() } : {}) }];
      continue;
    }
    if ((m = line.match(/^else\s*(?:\((.*)\))?\s*$/i))) {
      const f = frames[frames.length - 1];
      if (f?.kind !== 'if') { warnings.push(`Skipped: ${line}`); continue; }
      f.ends.push(...tails);
      f.hasElse = true;
      tails = [{ id: f.cur!, ...(m[1]?.trim() ? { guard: m[1].trim() } : {}) }];
      continue;
    }
    if (/^end\s*if$/i.test(line)) {
      const f = frames.pop();
      if (f?.kind !== 'if') { warnings.push(`Skipped: ${line}`); continue; }
      f.ends.push(...tails);
      if (!f.hasElse) f.ends.push({ id: f.cur! });
      close(f.ends, 'decision');
      continue;
    }
    if ((m = line.match(/^switch\s*\((.*)\)\s*$/i))) { const d = add(m[1].trim(), 'decision'); frames.push({ kind: 'switch', cur: d, ends: [] }); tails = []; continue; }
    if ((m = line.match(/^case\s*(?:\((.*)\))?\s*$/i))) {
      const f = frames[frames.length - 1];
      if (f?.kind !== 'switch') { warnings.push(`Skipped: ${line}`); continue; }
      if (f.started) f.ends.push(...tails);
      f.started = true;
      tails = [{ id: f.cur!, ...(m[1]?.trim() ? { guard: m[1].trim() } : {}) }];
      continue;
    }
    if (/^end\s*switch$/i.test(line)) {
      const f = frames.pop();
      if (f?.kind !== 'switch') { warnings.push(`Skipped: ${line}`); continue; }
      f.ends.push(...tails);
      close(f.ends, 'decision');
      continue;
    }
    if ((m = line.match(/^while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*$/i))) {
      const d = add(m[1].trim(), 'decision');
      frames.push({ kind: 'while', cur: d, ends: [] });
      tails = [{ id: d, ...(m[2]?.trim() ? { guard: m[2].trim() } : {}) }];
      continue;
    }
    if ((m = line.match(/^end\s*while\s*(?:\((.*?)\))?\s*$/i))) {
      const f = frames.pop();
      if (f?.kind !== 'while') { warnings.push(`Skipped: ${line}`); continue; }
      for (const t of tails) model.flows.push({ from: t.id, to: f.cur!, ...(t.guard ? { guard: t.guard } : {}) });
      tails = [{ id: f.cur!, ...(m[1]?.trim() ? { guard: m[1].trim() } : {}) }];
      last = f.cur;
      continue;
    }
    if (/^repeat$/i.test(line)) { const r = add('', 'decision'); frames.push({ kind: 'repeat', cur: r, ends: [] }); continue; }
    if ((m = line.match(/^repeat\s*while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*?)\))?\s*$/i))) {
      const f = frames.pop();
      if (f?.kind !== 'repeat') { warnings.push(`Skipped: ${line}`); continue; }
      const c = add(m[1].trim(), 'decision');
      model.flows.push({ from: c, to: f.cur!, ...(m[2]?.trim() ? { guard: m[2].trim() } : {}) });
      tails = [{ id: c, ...(m[3]?.trim() ? { guard: m[3].trim() } : {}) }];
      continue;
    }
    if ((m = line.match(/^(fork|split)$/i))) { const b = add('', 'fork'); frames.push({ kind: 'fork', cur: b, ends: [] }); tails = [{ id: b }]; continue; }
    if (/^(fork|split)\s+again$/i.test(line)) {
      const f = frames[frames.length - 1];
      if (f?.kind !== 'fork') { warnings.push(`Skipped: ${line}`); continue; }
      f.ends.push(...tails);
      tails = [{ id: f.cur! }];
      continue;
    }
    if (/^end\s*(fork|split|merge)$/i.test(line)) {
      const f = frames.pop();
      if (f?.kind !== 'fork') { warnings.push(`Skipped: ${line}`); continue; }
      f.ends.push(...tails);
      close(f.ends, 'fork');
      continue;
    }
    if ((m = line.match(/^note\s+(?:left|right|top|bottom)\s*(?:of\s+\w+)?\s*:?\s*(.*)$/i))) {
      let body = m[1].trim();
      if (!body) {
        const parts: string[] = [];
        while (i + 1 < lines.length && !/^end\s*note$/i.test(lines[i + 1].trim())) parts.push(lines[++i].trim());
        i++;
        body = parts.join('\n');
      }
      const id = `n${++n}`;
      model.nodes.push({ id, name: body.replace(/\\n/g, '\n'), kind: 'note', ...(lane ? { lane } : {}) });
      if (last) model.flows.push({ from: last, to: id, note: true });
      continue;
    }
    warnings.push(`Skipped: ${line}`);
  }
  // `end` / `stop` made loose ends; lanes without nodes are dropped
  model.lanes = model.lanes.filter((l) => model.nodes.some((x) => x.lane === l.id));
  return { model, warnings };
}
