import YAML from 'yaml';
import { InfraError } from './types';

const CFN_FUNCTIONS = ['Ref', 'GetAtt', 'Sub', 'Join', 'Select', 'If', 'Base64', 'ImportValue', 'FindInMap', 'Equals', 'Not', 'And', 'Or', 'Condition', 'Split', 'GetAZs', 'Cidr', 'Transform', 'Length', 'ToJsonString'];
/** CloudFormation's short forms (`!Ref X`, `!GetAtt A.B`, `!Join [..]`) become their long JSON forms (`{ Ref: X }`) */
const CFN_TAGS: YAML.Tags = CFN_FUNCTIONS.flatMap((n) => {
  const key = n === 'Ref' || n === 'Condition' ? n : `Fn::${n}`;
  return [
    { tag: `!${n}`, resolve: (str: string) => ({ [key]: str }) },
    { tag: `!${n}`, collection: 'seq' as const, resolve: (seq: YAML.YAMLSeq) => ({ [key]: seq.toJSON() }) },
    { tag: `!${n}`, collection: 'map' as const, resolve: (m: YAML.YAMLMap) => ({ [key]: m.toJSON() }) },
  ];
}) as unknown as YAML.Tags;

/** every document of a (multi-document) YAML text as plain data; null/empty documents are skipped; a syntax error names file and line */
export function yamlDocuments(text: string, fileName: string): unknown[] {
  const docs = YAML.parseAllDocuments(text, { customTags: CFN_TAGS, uniqueKeys: false, strict: false, prettyErrors: false });
  const out: unknown[] = [];
  docs.forEach((d, i) => {
    const err = d.errors[0];
    if (err) {
      const line = err.linePos?.[0]?.line;
      throw new InfraError(`${fileName}: YAML syntax error${docs.length > 1 ? ` in document ${i + 1}` : ''}${line ? ` (line ${line})` : ''}: ${err.message.split('\n')[0]}`);
    }
    const v = d.toJS({ maxAliasCount: 1000 }) as unknown;
    if (v !== null && v !== undefined && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)) out.push(v);
  });
  return out;
}
