import type { NoteDef, StateDef, StateKind, StateModel, StateParseResult } from './types';

const PSEUDO: Record<string, StateKind> = { choice: 'choice', fork: 'fork', join: 'join', history: 'history', deephistory: 'deepHistory', entrypoint: 'entryPoint', exitpoint: 'exitPoint' };
const REF = String.raw`\[\*\]|\[H\*?\]|"[^"]+"|[\w.-]+`;
const TRANS = new RegExp(String.raw`^(${REF})\s*-->\s*(${REF})\s*(?::\s*(.*))?$`);

export function parseStateMermaid(src: string): StateParseResult {
  const states: StateDef[] = [];
  const transitions: StateModel['transitions'] = [];
  const warnings: string[] = [];
  const notes: NoteDef[] = [];
  const regions = new Map<string, number>();
  const scopes: (string | undefined)[] = [undefined];
  const scope = () => scopes[scopes.length - 1];
  let direction: 'TB' | 'LR' | undefined;
  const region = () => (scope() ? regions.get(scope()!) ?? 0 : 0);
  const find = (id: string) => states.find((s) => s.id === id);
  const ensure = (id: string, extra: Partial<StateDef> = {}): StateDef => {
    let s = find(id);
    if (!s) { s = { id, name: id, kind: 'state', parent: scope(), ...(region() > 0 ? { region: region() } : {}), ...extra }; states.push(s); }
    return s;
  };
  /** [*] / [H] / [H*] are per scope; plain names are global */
  const ref = (token: string, asTarget: boolean): string => {
    const sc = (scope() ?? 'root') + (region() > 0 ? `_r${region()}` : '');
    if (token === '[*]') {
      const id = `${asTarget ? 'final' : 'initial'}_${sc}`;
      ensure(id, { name: '', kind: asTarget ? 'final' : 'initial' });
      return id;
    }
    if (token === '[H]' || token === '[H*]') {
      const deep = token === '[H*]';
      const id = `${deep ? 'deepHistory' : 'history'}_${sc}`;
      ensure(id, { name: deep ? 'H*' : 'H', kind: deep ? 'deepHistory' : 'history' });
      return id;
    }
    const id = token.replace(/^"|"$/g, '');
    return ensure(id).id;
  };
  const rawLines = src.split(/\r?\n/);
  for (let li = 0; li < rawLines.length; li++) {
    let line = rawLines[li].trim();
    let m = line.match(/^%%\s*sdd:(history|deepHistory|entryPoint|exitPoint)\s+(\S+)$/);
    if (m) {
      const s = ensure(m[2]); s.kind = m[1] as StateKind;
      if (m[1] === 'entryPoint' || m[1] === 'exitPoint') { if (s.name === s.id) s.name = ''; } else if (!s.name) s.name = m[1] === 'history' ? 'H' : 'H*';
      continue;
    }
    if (line === '--' || line === '||') {
      const sc = scope();
      if (sc) regions.set(sc, (regions.get(sc) ?? 0) + 1); else warnings.push('Region separator outside a composite state');
      continue;
    }
    if ((m = line.match(/^note\s+(left|right|top|bottom)\s+of\s+("[^"]+"|[\w.-]+)\s*(?::\s*(.*))?$/i))) {
      const target = ensure(m[2].replace(/^"|"$/g, '')).id;
      const side = m[1].toLowerCase() as NoteDef['side'];
      if (m[3] !== undefined) notes.push({ target, side, text: m[3].trim() });
      else {
        const body: string[] = [];
        while (li + 1 < rawLines.length && !/^end\s+note$/i.test(rawLines[li + 1].trim())) body.push(rawLines[++li].trim());
        li++;
        notes.push({ target, side, text: body.join('\n') });
      }
      continue;
    }
    if (!line || line.startsWith('%%') || /^stateDiagram(-v2)?\b/i.test(line) || /^(note|classDef|class|style|click|accTitle|accDescr)\b/i.test(line)) {
      if (/^note\b/i.test(line)) warnings.push(`Unsupported note: ${line}`);
      continue;
    }
    m = line.match(/^direction\s+(TB|TD|LR|RL|BT)\b/i);
    if (m) { direction = /^(LR|RL)$/i.test(m[1]) ? 'LR' : 'TB'; continue; }
    if (line === '}') { if (scopes.length > 1) scopes.pop(); else warnings.push('Unbalanced "}"'); continue; }
    if ((m = line.match(/^state\s+"([^"]+)"\s+as\s+([\w.-]+)\s*(\{)?$/i))) {
      const s = ensure(m[2], { name: m[1] });
      s.name = m[1];
      if (m[3]) { s.composite = true; scopes.push(s.id); }
      continue;
    }
    if ((m = line.match(/^state\s+([\w.-]+)\s*<<(\w+)>>$/i))) {
      const k = PSEUDO[m[2].toLowerCase()];
      if (!k) { warnings.push(`Unknown stereotype <<${m[2]}>>`); ensure(m[1]); continue; }
      const s = ensure(m[1], { kind: k });
      s.kind = k;
      if (k === 'choice' || k === 'fork' || k === 'join' || k === 'entryPoint' || k === 'exitPoint') s.name = '';
      continue;
    }
    if ((m = line.match(/^state\s+([\w.-]+)\s*\{$/i))) {
      const s = ensure(m[1]);
      s.composite = true;
      scopes.push(s.id);
      continue;
    }
    if ((m = line.match(/^state\s+([\w.-]+)$/i))) { ensure(m[1]); continue; }
    if ((m = line.match(TRANS))) {
      transitions.push({ from: ref(m[1], false), to: ref(m[2], true), label: (m[3] ?? '').trim() });
      continue;
    }
    if ((m = line.match(/^([\w.-]+)\s*:\s*(.*)$/))) {
      const s = ensure(m[1]);
      s.activity = s.activity ? `${s.activity}\n${m[2].trim()}` : m[2].trim();
      continue;
    }
    line = line.trim();
    warnings.push(`Unrecognised line: ${line}`);
  }
  if (scopes.length > 1) warnings.push('Unclosed "{"');
  return { model: { states, transitions, ...(notes.length ? { notes } : {}), ...(direction ? { direction } : {}) }, warnings };
}

const safeId = (s: StateDef, used: Set<string>): string => {
  let base = /^[A-Za-z_][\w]*$/.test(s.name) ? s.name : /^[A-Za-z_][\w]*$/.test(s.id) ? s.id : `s_${used.size + 1}`;
  while (used.has(base)) base += '_';
  used.add(base);
  return base;
};

export type StateDialect = 'mermaid' | 'plantuml';

export function renderStateMermaid(model: StateModel): string {
  return renderState(model, 'mermaid');
}
export function renderStatePlantUml(model: StateModel): string {
  return renderState(model, 'plantuml');
}

function renderState(model: StateModel, dialect: StateDialect): string {
  const puml = dialect === 'plantuml';
  const used = new Set<string>();
  const ids = new Map<string, string>();
  const isHist = (k: StateKind) => k === 'history' || k === 'deepHistory';
  for (const s of model.states) if (s.kind !== 'initial' && s.kind !== 'final' && !(puml && isHist(s.kind))) ids.set(s.id, safeId(s, used));
  const lines = puml ? ['@startuml'] : ['stateDiagram-v2'];
  if (model.direction === 'LR') lines.push(puml ? 'left to right direction' : '  direction LR');
  const ref = (id: string) => {
    const s = model.states.find((x) => x.id === id);
    if (!s) return id;
    if (s.kind === 'initial' || s.kind === 'final') return '[*]';
    if (puml && isHist(s.kind)) return s.kind === 'history' ? '[H]' : '[H*]';
    return ids.get(id)!;
  };
  const emit = (parent: string | undefined, ind: string) => {
    const all = model.states.filter((s) => s.parent === parent);
    const regionIds = [...new Set(all.map((s) => s.region ?? 0))].sort((a, b) => a - b);
    if (!regionIds.length) regionIds.push(0);
    const inScope = (id: string) => model.states.find((x) => x.id === id)?.parent;
    regionIds.forEach((r, ri) => {
      if (ri > 0) lines.push(`${ind}--`);
      const mine = all.filter((s) => (s.region ?? 0) === r);
      for (const s of mine) {
        const id = ids.get(s.id);
        if (!id) continue;
        if (s.kind === 'choice' || s.kind === 'fork' || s.kind === 'join') lines.push(`${ind}state ${id} <<${s.kind}>>`);
        else if (s.kind === 'entryPoint' || s.kind === 'exitPoint') {
          // PlantUML has the stereotype; Mermaid does not, so a plain state plus an `sdd:` comment this importer reads back
          if (puml) lines.push(`${ind}state ${id} <<${s.kind}>>`);
          else lines.push(`${ind}state ${id}`, `${ind}%% sdd:${s.kind} ${id}`);
        }
        else if (s.composite) {
          lines.push(`${ind}state ${s.name !== id ? `"${s.name}" as ` : ''}${id} {`);
          emit(s.id, ind + '  ');
          lines.push(`${ind}}`);
        } else {
          // Mermaid has no history syntax: plain state named H / H* plus an `sdd:` comment that this importer reads back
          if (isHist(s.kind)) {
            lines.push(`${ind}state "${s.name || 'H'}" as ${id}`);
            lines.push(`${ind}%% sdd:${s.kind} ${id}`);
          } else if (s.name !== id) lines.push(`${ind}state "${s.name}" as ${id}`);
          else if (!model.transitions.some((t) => t.from === s.id || t.to === s.id) && !s.activity) lines.push(`${ind}state ${id}`);
          for (const a of (s.activity ?? '').split('\n').filter(Boolean)) lines.push(`${ind}${id} : ${a}`);
        }
      }
      // transitions are written in the scope where both ends live (the nearest common parent)
      for (const t of model.transitions) {
        const scopeOf = inScope(t.from) === inScope(t.to) ? inScope(t.from) : undefined;
        if (scopeOf !== parent) continue;
        const from = model.states.find((x) => x.id === t.from);
        if (parent !== undefined && (from?.region ?? 0) !== r) continue;
        lines.push(`${ind}${ref(t.from)} --> ${ref(t.to)}${t.label ? ` : ${t.label}` : ''}`);
      }
    });
  };
  emit(undefined, puml ? '' : '  ');
  for (const n of model.notes ?? []) {
    const id = ids.get(n.target);
    if (!id) continue;
    const side = !puml && (n.side === 'top' || n.side === 'bottom') ? 'right' : n.side;
    const ind = puml ? '' : '  ';
    if (n.text.includes('\n')) lines.push(`${ind}note ${side} of ${id}`, ...n.text.split('\n').map((l) => `${ind}  ${l}`), `${ind}end note`);
    else lines.push(`${ind}note ${side} of ${id} : ${n.text}`);
  }
  if (puml) lines.push('@enduml');
  return lines.join('\n') + '\n';
}
