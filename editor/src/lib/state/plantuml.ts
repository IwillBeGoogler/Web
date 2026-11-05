import { parseStateMermaid, renderStatePlantUml } from './mermaid';
import type { StateParseResult } from './types';

export { renderStatePlantUml };

const REF = String.raw`\[\*\]|\[H\*?\]|"[^"]+"|[\w.-]+`;
/** `A -> B`, `A --> B`, `A -down-> B`, `A -[#red]-> B` */
const ARROW = new RegExp(String.raw`^(${REF})\s*-+(?:\[[^\]]*\])?(?:left|right|up|down|l|r|u|d)?(?:\[[^\]]*\])?-*>\s*(${REF})\s*(?::\s*(.*))?$`, 'i');

/** is this text a PlantUML state diagram (`[*]`, `state X`, no class / sequence keywords) */
export function isPlantUmlState(text: string): boolean {
  if (!/@startuml/i.test(text)) return false;
  if (/^\s*(abstract\s+)?(class|interface|enum)\s+\S+/m.test(text)) return false;
  if (/^\s*(participant|actor|boundary|control|entity|database|alt|loop|opt|activate|autonumber|usecase|component|node)\b/m.test(text)) return false;
  return /^\s*state\s+\S+/m.test(text) || /\[\*\]\s*-+(\[[^\]]*\])?\w*-*>|-+>\s*\[\*\]/.test(text);
}

/** PlantUML state diagram → the same model as Mermaid: the text is normalised into Mermaid syntax first. */
export function parsePlantUmlState(src: string): StateParseResult {
  const out: string[] = ['stateDiagram-v2'];
  const warnings: string[] = [];
  for (const raw of src.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("'") || /^(@startuml|@enduml|hide\b|show\b|skinparam\b|title\b|scale\b|!)/i.test(line)) continue;
    if (/^left to right direction$/i.test(line)) { out.push('direction LR'); continue; }
    if (/^top to bottom direction$/i.test(line)) { out.push('direction TB'); continue; }
    line = line.replace(/\s#[\w]+(?=\s|\{|$)/g, '').replace(/\s*;$/, '');
    let m: RegExpMatchArray | null;
    if ((m = line.match(ARROW))) { out.push(`${m[1]} --> ${m[2]}${m[3] ? ` : ${m[3]}` : ''}`); continue; }
    if ((m = line.match(/^state\s+([\w.-]+)\s*:\s*(.*)$/i))) { out.push(`${m[1]} : ${m[2]}`); continue; }
    if ((m = line.match(/^state\s+([\w.-]+)\s+as\s+"([^"]+)"\s*(\{)?$/i))) { out.push(`state "${m[2]}" as ${m[1]}${m[3] ? ' {' : ''}`); continue; }
    if ((m = line.match(/^state\s+(.+?)\s*<<(\w+)>>$/i)) && /^end$/i.test(m[2])) { out.push(`state ${m[1]}`); continue; }
    out.push(line);
  }
  const r = parseStateMermaid(out.join('\n'));
  return { model: r.model, warnings: [...warnings, ...r.warnings] };
}
