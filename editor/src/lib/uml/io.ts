import { parseCSharp } from './csharp';
import { parseGo } from './go';
import { parseJava } from './java';
import { parseMermaid, renderMermaid } from './mermaid';
import type { UmlModel, UmlParseResult } from './model';
import { parsePlantUml, renderPlantUml } from './plantuml';
import { parsePython } from './python';
import { renderJava, renderTypeScript } from './skeleton';

export type UmlFormat = 'typescript' | 'java' | 'python' | 'go' | 'csharp' | 'mermaid' | 'plantuml';
export const UML_IMPORT_FORMATS: { id: UmlFormat; label: string; ext: string }[] = [
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'go', label: 'Go', ext: 'go' },
  { id: 'csharp', label: 'C#', ext: 'cs' },
  { id: 'mermaid', label: 'Mermaid classDiagram', ext: 'mmd' },
  { id: 'plantuml', label: 'PlantUML', ext: 'puml' },
];
export const UML_EXPORT_FORMATS: { id: UmlFormat; label: string; ext: string; mime: string }[] = [
  { id: 'mermaid', label: 'Mermaid classDiagram', ext: 'mmd', mime: 'text/plain' },
  { id: 'plantuml', label: 'PlantUML', ext: 'puml', mime: 'text/plain' },
  { id: 'typescript', label: 'TypeScript class skeletons', ext: 'ts', mime: 'text/plain' },
  { id: 'java', label: 'Java class skeletons', ext: 'java', mime: 'text/plain' },
];

export function detectUmlFormat(text: string): UmlFormat {
  const t = text.trim();
  if (/^(%%.*\n)*\s*classDiagram/i.test(t)) return 'mermaid';
  if (/@startuml/i.test(t) || (/^\s*(abstract\s+class|interface|enum|class)\s+\S+.*$/m.test(t) && /^\s*\S+\s+("[^"]*"\s+)?[<*o|]*(-|\.)+[>*o|]*\s+/m.test(t) && !/[;]\s*$/m.test(t) && !/\bdef\s/.test(t))) return 'plantuml';
  if (/^\s*package\s+\w+\s*$/m.test(t) && (/\btype\s+\w+(\[[^\]]*\])?\s+(struct|interface)\b/.test(t) || /^func\s/m.test(t))) return 'go';
  if (/^\s*using\s+System\b/m.test(t) || /\bnamespace\s+[\w.]+\s*;/.test(t) || (/\bnamespace\s+[\w.]+/.test(t) && /\b(public|internal)\s+(abstract\s+|sealed\s+|static\s+)*(class|interface|enum|struct|record)\b/.test(t) && !/\bexport\b/.test(t)) || /\{\s*get;\s*(private\s+|protected\s+)?(set|init);?\s*\}/.test(t)) return 'csharp';
  if (/^\s*(package\s+[\w.]+\s*;|import\s+java\.|public\s+(abstract\s+)?(class|interface|enum)\b[^{]*\{)/m.test(t) && !/^\s*(export|interface\s+\w+\s*(<[^>]*>)?\s*(extends\s+[\w, <>]+)?\s*\{[^}]*:)/m.test(t) && /;\s*$/m.test(t) && !/:\s*(string|number|boolean)\b/.test(t)) return 'java';
  if (/^\s*(def\s+\w+\(|class\s+\w+(\([^)]*\))?\s*:|from\s+\w+\s+import|import\s+\w+\s*$)/m.test(t)) return 'python';
  if (/^\s*(public|private|protected)?\s*(abstract\s+)?(class|interface|enum)\s+\w+[^{]*\{/m.test(t) && /;\s*$/m.test(t) && !/:\s*[A-Za-z<>\[\]]+\s*[;=,)]/.test(t) && /\b(String|int|void|boolean)\b/.test(t)) return 'java';
  return 'typescript';
}

export interface UmlImport extends UmlParseResult { format: UmlFormat }

/** Parse source text; TypeScript pulls the compiler API in lazily, so this is async. */
export async function importUmlText(text: string, format: UmlFormat | 'auto' = 'auto', opts: { associations?: boolean } = {}): Promise<UmlImport> {
  const f = format === 'auto' ? detectUmlFormat(text) : format;
  switch (f) {
    case 'mermaid': return { ...parseMermaid(text), format: f };
    case 'plantuml': return { ...parsePlantUml(text), format: f };
    case 'java': return { ...parseJava(text), format: f };
    case 'python': return { ...parsePython(text), format: f };
    case 'go': return { ...parseGo(text), format: f };
    case 'csharp': return { ...parseCSharp(text), format: f };
    default: {
      const { parseTypeScript } = await import('./typescript');
      return { ...(await parseTypeScript(text, opts)), format: 'typescript' };
    }
  }
}

export function exportUmlText(model: UmlModel, format: UmlFormat): string {
  switch (format) {
    case 'plantuml': return renderPlantUml(model);
    case 'typescript': return renderTypeScript(model);
    case 'java': return renderJava(model);
    default: return renderMermaid(model);
  }
}
