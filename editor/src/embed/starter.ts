/**
 * Starting documents for a host that creates files itself (the IWillBeGoogler "Write" menu): a DB diagram starts with one table, an OOD
 * diagram with one class, a system design stays empty. Built with the editor's own template pipelines (`parseSql` +
 * `schemaToDiagram`, `modelToDiagram`), so what the host stores is exactly what the editor would draw.
 *
 * A separate entry on purpose: the host imports this on "create" without loading the editor itself.
 */
import { createProject } from '../lib/project';
import { schemaToDiagram } from '../lib/er/convert';
import { parseSql } from '../lib/er/sqlParse';
import { modelToDiagram } from '../lib/uml/convert';
import { parseMember } from '../lib/uml/member';
import { newClassDef } from '../lib/uml/model';
import type { Diagram, Project } from '../types';

export type StarterKind = 'sdd' | 'erd' | 'uml' | 'board';

export const STARTER_SQL = `CREATE TABLE users (
  id         uuid PRIMARY KEY,
  email      varchar(255) NOT NULL UNIQUE,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const starterDiagram = (kind: StarterKind): Diagram | null => {
  if (kind === 'erd') return schemaToDiagram(parseSql(STARTER_SQL).schema);
  if (kind === 'uml')
    return modelToDiagram({
      classes: [
        newClassDef('User', {
          attributes: ['- id: string', '- email: string', '- name: string'].map((t) => parseMember(t, 'attribute')),
          operations: ['+ rename(name: string): void'].map((t) => parseMember(t, 'operation')),
        }),
      ],
      relations: [],
    });
  return null;
};

/** the document (Project v2, the `data` of a file) a new file of this kind starts with; `null` = let the server create its empty default */
export function starterProject(kind: StarterKind, name: string): Project | null {
  const d = starterDiagram(kind);
  if (!d) return null;
  const p = createProject(name);
  const page = p.pages[0]!;
  page.nodes = d.nodes;
  page.edges = d.edges;
  return p;
}
