/** CodeMirror language support for the `.sdd` text format: highlighting, icon / keyword / node-id completion. Loaded lazily with the editor. */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StreamParser } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchCatalog } from '@core/catalog';

const KEYWORDS = /^(node|group|table|view|enum|ref|seq|diagram|indexes|note|participant|actor|boundary|control|entity|database|alt|opt|loop|par|break|critical|else|and|option|end|autonumber|over|left of|right of|classes|states|usecases|components|communication|timing|robust|concise|binary|clock|unit|package|class|interface|abstract|extends|implements|state|initial|final|choice|fork|join|history|deepHistory|entryPoint|exitPoint|region|usecase|point|include|extend|generalizes|component|artifact|provides|requires|activity|deployment|lane|flowFinal|action|decision|object|send|accept|device|executionEnvironment|manifests|packages|objects|imports|merges|access)\b/;
const FLAGS = /^(pk|unique|not null|null|increment|default|dashed)\b/;

const parser: StreamParser<unknown> = {
  token(stream) {
    if (stream.sol() && stream.match(/#!sdd.*/)) return 'meta';
    if (stream.match(/\/\/.*/) || (stream.sol() && stream.match(/#.*/))) return 'comment';
    if (stream.eatSpace()) return null;
    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/(?:<->|<-|-->>|-->|->>|->|--\|>|\.\.\|>|--\*|--o|\.\.>|--|-x)(?=\s|$)/)) return 'operator';
    if (stream.match(/[A-Za-z_][\w-]*(?==)/)) return 'propertyName';
    if (stream.match(KEYWORDS)) return 'keyword';
    if (stream.match(FLAGS)) return 'atom';
    if (stream.match(/-?\d+(?:\.\d+)?/)) return 'number';
    if (stream.match(/[A-Za-z_][\w.-]*/)) return null;
    stream.next();
    return null;
  },
};

export const sddLanguage = StreamLanguage.define(parser);

export const sddHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--cm-keyword)', fontWeight: '600' },
    { tag: tags.string, color: 'var(--cm-string)' },
    { tag: tags.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
    { tag: tags.operator, color: 'var(--cm-operator)' },
    { tag: tags.propertyName, color: 'var(--cm-prop)' },
    { tag: tags.atom, color: 'var(--cm-atom)' },
    { tag: tags.number, color: 'var(--cm-number)' },
    { tag: tags.meta, color: 'var(--cm-comment)' },
  ]),
);

const TOP_KEYWORDS: Completion[] = ['node', 'group', 'table', 'view', 'enum', 'ref:', 'seq', 'diagram', 'classes {', 'states {', 'usecases {', 'components {', 'activity {', 'deployment {', 'packages {', 'objects {', 'communication {', 'timing'].map((label) => ({ label, type: 'keyword' }));
const kws = (l: string[]): Completion[] => l.map((label) => ({ label, type: 'keyword' }));
const CLASS_KEYWORDS = kws(['class', 'abstract class', 'interface', 'enum', 'package', 'extends', 'implements']);
const STATE_KEYWORDS = kws(['state', 'initial', 'final', 'choice', 'fork', 'join', 'history', 'deepHistory', 'entryPoint', 'exitPoint', 'region']);
const UC_KEYWORDS = kws(['actor', 'usecase', 'boundary', 'point', 'include', 'extend', 'generalizes']);
const COMP_KEYWORDS = kws(['component', 'node', 'artifact', 'provides', 'requires']);
const ACT_KEYWORDS = kws(['lane', 'initial', 'final', 'flowFinal', 'action', 'decision', 'fork', 'object', 'send', 'accept', 'note']);
const DEP_KEYWORDS = kws(['node', 'device', 'executionEnvironment', 'artifact', 'component', 'manifests']);
const PKG_KEYWORDS = kws(['package', 'imports', 'access', 'merges']);
const OBJ_KEYWORDS = kws(['object', 'class=', 'srcRole=', 'dstRole=']);
const COMM_KEYWORDS = kws(['object', 'class=', 'srcRole=', 'dstRole=', 'async']);
const TIMING_KEYWORDS = kws(['unit', 'end', 'robust', 'concise', 'binary', 'clock', 'states', 'period=']);
const BLOCK_RE: [RegExp, Completion[]][] = [[/\bcommunication\s*\{[^]*$/, COMM_KEYWORDS], [/\btiming\b[^\n]*\{[^]*$/, TIMING_KEYWORDS], [/\bpackages\s*\{[^]*$/, PKG_KEYWORDS], [/\bobjects\s*\{[^]*$/, OBJ_KEYWORDS], [/\bclasses\s*\{[^]*$/, CLASS_KEYWORDS], [/\bstates\s*\{[^]*$/, STATE_KEYWORDS], [/\busecases\s*\{[^]*$/, UC_KEYWORDS], [/\bcomponents\s*\{[^]*$/, COMP_KEYWORDS], [/\bactivity\s*\{[^]*$/, ACT_KEYWORDS], [/\bdeployment\s*\{[^]*$/, DEP_KEYWORDS]];
const SEQ_KEYWORDS: Completion[] = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'note over', 'alt', 'opt', 'loop', 'par', 'break', 'critical', 'else', 'and', 'end', 'autonumber'].map((label) => ({ label, type: 'keyword' }));
const PRESETS: Completion[] = ['metrics', 'logs', 'traces', 'control', 'backup'].map((label) => ({ label, type: 'enum', detail: 'edge preset' }));
const COLUMN_TYPES: Completion[] = ['uuid', 'text', 'varchar(255)', 'int', 'bigint', 'boolean', 'timestamp', 'timestamptz', 'date', 'numeric(10,2)', 'jsonb', 'float'].map((label) => ({ label, type: 'type' }));

export function iconCompletions(prefix: string): Completion[] {
  return searchCatalog(prefix, { limit: 40 }).map((h) => ({ label: h.id, detail: h.label, type: h.kind === 'group' ? 'namespace' : h.kind === 'cluster' ? 'class' : 'constant', boost: h.id === prefix ? 99 : 0 }));
}

/** node / group ids declared in the document (for edge endpoints) */
export function declaredIds(doc: string): string[] {
  const out: string[] = [];
  for (const m of doc.matchAll(/^\s*(?:node|group)\s+("[^"]+"|[^\s"{]+)/gm)) out.push(m[1].replace(/^"|"$/g, ''));
  return out;
}
export function declaredTables(doc: string): string[] {
  return [...doc.matchAll(/^\s*(?:table|view|enum)\s+("[^"]+"|[^\s"{]+)/gm)].map((m) => m[1].replace(/^"|"$/g, ''));
}

/** pure so it can be tested without a view */
export function completeAt(doc: string, pos: number): { from: number; options: Completion[] } | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const before = doc.slice(lineStart, pos);
  let m = /icon=([\w-]*)$/.exec(before);
  if (m) return { from: pos - m[1].length, options: iconCompletions(m[1]) };
  m = /preset=([\w-]*)$/.exec(before);
  if (m) return { from: pos - m[1].length, options: PRESETS };
  m = /ref\s*:\s*(?:[^\s]+\s+[<>-]+\s+)?([\w"]*)$/.exec(before) ?? /ref:\s*[<>-]+\s*([\w"]*)$/.exec(before);
  if (m && /\bref\b/.test(before)) return { from: pos - m[1].length, options: declaredTables(doc).map((label) => ({ label, type: 'class' })) };
  m = /^\s*([\w-]*)$/.exec(before);
  if (m) {
    const head = doc.slice(0, pos);
    const lastBlock = Math.max(...['classes', 'states', 'usecases', 'components', 'activity', 'deployment', 'packages', 'objects', 'communication', 'timing', 'seq', 'table', 'view', 'enum'].map((k) => head.search(new RegExp(`^${k}\\b[^\\n]*\\{[^]*$`, 'm'))));
    const blk = lastBlock >= 0 ? BLOCK_RE.find(([re]) => re.test(head.slice(lastBlock))) : undefined;
    if (blk && (head.slice(lastBlock).match(/\{/g)?.length ?? 0) > (head.slice(lastBlock).match(/\}/g)?.length ?? 0)) return { from: pos - m[1].length, options: blk[1] };
    const inSeq = /\bseq\b[^\n]*\{[^}]*$/.test(doc.slice(0, pos));
    const inTable = /\b(?:table|view)\b[^\n]*\{[^}]*$/.test(doc.slice(0, pos));
    return { from: pos - m[1].length, options: inSeq ? SEQ_KEYWORDS : inTable ? COLUMN_TYPES.slice(0, 0) : TOP_KEYWORDS };
  }
  m = /^\s*(?:[\w-]+\s+)?[\w-]+\s+(?:->|<->|--|<-)\s+([\w-]*)$/.exec(before) ?? /^\s*([\w-]*)$/.exec(before);
  if (m && /(->|<->|--|<-)\s+[\w-]*$/.test(before)) return { from: pos - m[1].length, options: declaredIds(doc).map((label) => ({ label, type: 'variable' })) };
  m = /^\s*[\w-]+\s+([\w(),]*)$/.exec(before);
  if (m && /\b(?:table|view)\b[^\n]*\{[^}]*$/.test(doc.slice(0, pos))) return { from: pos - m[1].length, options: COLUMN_TYPES };
  return null;
}

export const sddCompletion = autocompletion({
  activateOnTyping: true,
  override: [
    (ctx: CompletionContext): CompletionResult | null => {
      const r = completeAt(ctx.state.doc.toString(), ctx.pos);
      if (!r || (!ctx.explicit && r.options.length === 0)) return null;
      return { from: r.from, options: r.options, validFor: /^[\w-]*$/ };
    },
  ],
});
