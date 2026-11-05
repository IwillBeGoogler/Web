import { parseSeqMermaid, renderSeqMermaid } from './mermaid';
import { parseSeqPlantUml, renderSeqPlantUml } from './plantuml';
import type { SeqParseResult, SequenceModel } from './types';

export type SeqFormat = 'mermaid' | 'plantuml';
export const SEQ_FORMATS: { id: SeqFormat; label: string; ext: string }[] = [
  { id: 'mermaid', label: 'Mermaid sequenceDiagram', ext: 'mmd' },
  { id: 'plantuml', label: 'PlantUML sequence', ext: 'puml' },
];

/** is this text a sequence diagram (so the UML import dialog can route it here instead of the class parsers) */
export function detectSeqFormat(text: string): SeqFormat | undefined {
  const t = text.trim();
  if (/^(%%.*\n|\s)*sequenceDiagram\b/i.test(t)) return 'mermaid';
  if (/@startuml/i.test(t) && !/^\s*(abstract\s+)?(class|interface|enum)\s+\S+/m.test(t) && /^\s*(\S+|"[^"]+")\s*<{0,2}-+>{0,2}\s*(\S+|"[^"]+")\s*(:|$)/m.test(t) && /^\s*(participant|actor|boundary|control|entity|database|alt|loop|opt|activate|autonumber)\b|^\s*\S+\s*-+>{1,2}\s*\S+\s*:/m.test(t)) return 'plantuml';
  return undefined;
}
export function importSeqText(text: string, format: SeqFormat | 'auto' = 'auto'): (SeqParseResult & { format: SeqFormat }) | undefined {
  const f = format === 'auto' ? detectSeqFormat(text) : format;
  if (!f) return undefined;
  return { ...(f === 'mermaid' ? parseSeqMermaid(text) : parseSeqPlantUml(text)), format: f };
}
export const exportSeqText = (model: SequenceModel, format: SeqFormat): string => (format === 'plantuml' ? renderSeqPlantUml(model) : renderSeqMermaid(model));
