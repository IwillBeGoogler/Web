// the "Database (ER)" palette section (table, junction, view, enum, note).
import { registerSections, type CatalogItem, type CatalogSection } from './catalog';

const ER_TAGS = ['er', 'erd', 'database', 'schema', 'table'];
const item = (id: string, label: string, aliases: string[], keywords: string[], extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id, label, kind: 'table', aliases, keywords, tags: [...ER_TAGS, ...(extra.tags ?? [])], ...extra,
});

export const ERD_SECTION: CatalogSection = {
  id: 'erd',
  label: 'Database (ER)',
  count: 5,
  subs: [
    {
      id: 'erd-objects',
      label: 'Tables and relations',
      items: [
        item('er-table', 'Table', ['entity', 'relation table'], ['columns', 'primary key', 'foreign key', 'crow']),
        item('er-junction', 'Junction table', ['join table', 'link table', 'bridge'], ['many to many', 'composite key']),
        item('er-view', 'View', ['database view'], ['select', 'virtual table']),
        item('er-enum', 'Enum', ['enumeration', 'type'], ['values', 'lookup']),
        { id: 'er-note', label: 'Note', kind: 'sticky', aliases: ['er note', 'annotation'], keywords: ['comment'], tags: [...ER_TAGS, 'sticky'], preset: { width: 200, height: 90, data: { label: 'Note', fill: '#dbeafe', stroke: '#2f6fdb', strokeWidth: 1.2, fontSize: 13 } } },
      ],
    },
  ],
};

export function registerErdSection(): void {
  registerSections([ERD_SECTION]);
}
