import type { Schema, SchemaColumn, SchemaTable } from './types';

// ---- a tiny YAML emitter for plain data (no dependency; the tests parse its output with a real YAML parser) ----
const RESERVED = /^(true|false|yes|no|on|off|null|~|y|n)$/i;
function scalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  const plain = /^[A-Za-z_][A-Za-z0-9_.()/%-]*( [A-Za-z0-9_.()/%-]+)*$/.test(s) && !RESERVED.test(s);
  return plain ? s : JSON.stringify(s);
}
export function toYaml(v: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return v.map((x) => {
      if (x && typeof x === 'object' && !(Array.isArray(x) && !x.length) && Object.keys(x).length) {
        const inner = toYaml(x, indent + 1).split('\n');
        return `${pad}- ${inner[0].trimStart()}${inner.length > 1 ? '\n' + inner.slice(1).join('\n') : ''}`;
      }
      return `${pad}- ${typeof x === 'object' && x !== null ? toYaml(x, indent + 1) : scalar(x)}`;
    }).join('\n');
  }
  if (v && typeof v === 'object') {
    const e = Object.entries(v as Record<string, unknown>);
    if (!e.length) return '{}';
    return e.map(([k, x]) => {
      const key = scalar(k);
      if (Array.isArray(x) && x.length) return `${pad}${key}:\n${toYaml(x, indent + 1)}`;
      if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length) return `${pad}${key}:\n${toYaml(x, indent + 1)}`;
      return `${pad}${key}: ${typeof x === 'object' && x !== null ? toYaml(x) : scalar(x)}`;
    }).join('\n');
  }
  return scalar(v);
}

export interface Generator { generator: string; [k: string]: unknown }

/** a data generator for a column, from its name and type (fixed rules, no guessing by a model) */
export function generatorFor(c: SchemaColumn, _table: string, enums: Schema['enums'] = []): Generator {
  void _table;
  if (c.fk) return { generator: 'reference', table: c.fk.table, column: c.fk.column };
  const t = c.type.toLowerCase();
  const n = c.name.toLowerCase();
  const en = enums.find((e) => e.name.toLowerCase() === t);
  if (en) return { generator: 'enum', values: en.values };
  const isEnumType = /^enum\(/.test(t);
  if (isEnumType) return { generator: 'enum', values: [...t.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")) };
  if (c.pk && (c.generated === 'autoincrement' || c.generated === 'identity')) return { generator: 'sequence' };
  if (/uuid/.test(t)) return { generator: 'uuid' };
  if (/bool|bit\(1\)|tinyint\(1\)/.test(t) || /^(is|has|can)_/.test(n)) return { generator: 'boolean' };
  if (/email/.test(n)) return { generator: 'email' };
  if (/(^|_)first_?name$|^given_name$/.test(n)) return { generator: 'first_name' };
  if (/(^|_)last_?name$|^surname$|^family_name$/.test(n)) return { generator: 'last_name' };
  if (/^(full_?)?name$|^display_name$|^username$/.test(n)) return { generator: /user/.test(n) ? 'username' : 'full_name' };
  if (/phone|mobile|tel$/.test(n)) return { generator: 'phone' };
  if (/url|website|link$|href/.test(n)) return { generator: 'url' };
  if (/country/.test(n)) return { generator: 'country' };
  if (/city/.test(n)) return { generator: 'city' };
  if (/address|street/.test(n)) return { generator: 'address' };
  if (/(zip|postal)/.test(n)) return { generator: 'postal_code' };
  if (/json/.test(t)) return { generator: 'json' };
  if (/timestamp|datetime/.test(t) || /_at$/.test(n)) return { generator: 'timestamp' };
  if (/^date$/.test(t) || /(^|_)(date|day|birthday)$/.test(n)) return { generator: 'date' };
  if (/^time/.test(t)) return { generator: 'time' };
  if (/(numeric|decimal|money|float|double|real)/.test(t) && /(price|amount|total|cost|fee|balance|salary|revenue)/.test(n)) return { generator: 'money' };
  if (/(numeric|decimal|float|double|real)/.test(t)) return { generator: 'decimal' };
  if (/int/.test(t) && /(price|amount|total|cost|cents)/.test(n)) return { generator: 'money' };
  if (/int|serial/.test(t)) return { generator: 'integer' };
  if (/(char|text|string|clob)/.test(t)) return /(description|notes?|bio|body|content|comment|message|summary)/.test(n) ? { generator: 'text' } : { generator: 'word' };
  return { generator: 'text' };
}

function dependencyOrder(tables: SchemaTable[]): SchemaTable[] {
  const by = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  const done = new Set<string>();
  const out: SchemaTable[] = [];
  const visit = (t: SchemaTable, stack: Set<string>) => {
    const k = t.name.toLowerCase();
    if (done.has(k) || stack.has(k)) return;
    stack.add(k);
    for (const c of t.columns) if (c.fk && c.fk.table.toLowerCase() !== k && by.has(c.fk.table.toLowerCase())) visit(by.get(c.fk.table.toLowerCase())!, stack);
    done.add(k);
    out.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return out;
}

/**
 * `seedora.yaml`: the schema model of the JSON export (tables, columns, primary keys, foreign keys, checks, enums) plus a `seed`
 * block with row counts and one generator per column, parents before children. The generator names are this tool's own vocabulary
 * (documented in docs/schema-tools.md); edit them freely.
 */
export function seedoraYaml(schema: Schema, opts: { rows?: number; seed?: number } = {}): string {
  const rows = opts.rows ?? 100;
  const tables = schema.tables.filter((t) => t.kind !== 'view');
  const ordered = dependencyOrder(tables);
  const model = {
    version: 1,
    tables: tables.map((t) => ({
      ...(t.schema ? { schema: t.schema } : {}),
      name: t.name,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type.replace(/\(.*$/, '').trim(),
        native: c.type,
        nullable: c.nullable && !c.pk,
        has_default: c.default !== undefined || !!c.generated,
        generated: !!c.generated?.startsWith('as '),
        unique: c.unique,
        ...(c.fk ? { fk: { table: c.fk.table, column: c.fk.column } } : {}),
      })),
      primary_key: t.columns.filter((c) => c.pk).map((c) => c.name),
      ...(t.checks.length ? { checks: t.checks.map((k) => ({ name: k.name ?? '', expr: k.expr })) } : {}),
    })),
    ...(schema.enums.length ? { enums: Object.fromEntries(schema.enums.map((e) => [e.name, e.values])) } : {}),
    seed: {
      seed: opts.seed ?? 1,
      order: ordered.map((t) => t.name),
      tables: Object.fromEntries(
        ordered.map((t) => [
          t.name,
          {
            rows: t.columns.some((c) => c.fk) ? rows * 5 : rows,
            columns: Object.fromEntries(t.columns.map((c) => [c.name, generatorFor(c, t.name, schema.enums)])),
          },
        ]),
      ),
    },
  };
  return `# seedora.yaml, generated by System Design Diagram. The "seed" block is a starting point: change row counts and generators as you like.\n${toYaml(model)}\n`;
}
