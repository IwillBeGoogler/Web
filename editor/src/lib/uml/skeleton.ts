import type { MemberDef, UmlClassDef, UmlModel } from './model';

const heritage = (m: UmlModel, c: UmlClassDef) => {
  const ext = m.relations.filter((r) => r.from === c.name && r.kind === 'inheritance').map((r) => r.to);
  const impl = m.relations.filter((r) => r.from === c.name && r.kind === 'realization').map((r) => r.to);
  return { ext, impl };
};
const shown = (m: UmlModel) => m.classes.filter((c) => !(c.external && !c.attributes.length && !c.operations.length));
const cleanName = (n: string) => n.replace(/^\.\.\./, '').replace(/\?$/, '');

// ---------------------------------------------------------------- TypeScript
const tsVis = (v: string) => (v === '-' ? 'private ' : v === '#' ? 'protected ' : '');

export function renderTypeScript(m: UmlModel): string {
  const out: string[] = [];
  const params = (ps: MemberDef['params'] = []) => ps.map((p) => `${p.name}${p.type ? `: ${p.type}` : ': any'}`).join(', ');
  for (const c of shown(m)) {
    const { ext, impl } = heritage(m, c);
    const gen = c.generics ? `<${c.generics}>` : '';
    if (c.kind === 'enum') {
      out.push(`export enum ${c.name} {`, ...c.attributes.map((a) => `  ${a.name},`), '}', '');
      continue;
    }
    if (c.kind === 'interface') {
      out.push(`export interface ${c.name}${gen}${[...ext, ...impl].length ? ` extends ${[...ext, ...impl].join(', ')}` : ''} {`);
      for (const a of c.attributes) out.push(`  ${a.name}${a.type ? `: ${a.type}` : ': any'};`);
      for (const o of c.operations) out.push(`  ${o.name}(${params(o.params)})${o.type ? `: ${o.type}` : ': void'};`);
      out.push('}', '');
      continue;
    }
    out.push(`export ${c.kind === 'abstract' ? 'abstract ' : ''}class ${c.name}${gen}${ext.length ? ` extends ${ext[0]}` : ''}${[...ext.slice(1), ...impl].length ? ` implements ${[...ext.slice(1), ...impl].join(', ')}` : ''} {`);
    for (const a of c.attributes) out.push(`  ${tsVis(a.visibility)}${a.static ? 'static ' : ''}${a.name}${a.type ? `: ${a.type}` : ': any'}${a.default ? ` = ${a.default}` : ''};`);
    if (c.attributes.length && c.operations.length) out.push('');
    for (const o of c.operations) {
      const isCtor = o.name === c.name || o.name === '__init__';
      if (isCtor) { out.push(`  constructor(${params(o.params)}) {`, '  }'); continue; }
      const sig = `${tsVis(o.visibility)}${o.static ? 'static ' : ''}${o.abstract ? 'abstract ' : ''}${o.name}(${params(o.params)})${o.type ? `: ${o.type}` : ''}`;
      if (o.abstract) out.push(`  ${sig};`);
      else out.push(`  ${sig} {`, `    throw new Error('Not implemented');`, '  }');
    }
    out.push('}', '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

// ---------------------------------------------------------------- Java
const JAVA_TYPES: Record<string, string> = { number: 'double', string: 'String', boolean: 'boolean', any: 'Object', unknown: 'Object', void: 'void', bigint: 'long', str: 'String', int: 'int', float: 'double', bool: 'boolean', None: 'void', Date: 'Date' };
const javaType = (t: string | undefined, fallback = 'Object'): string =>
  t ? t.replace(/\b[A-Za-z_]\w*\b/g, (w) => JAVA_TYPES[w] ?? w).replace(/\[\]/g, '[]') : fallback;
const jVis = (v: string) => (v === '-' ? 'private ' : v === '#' ? 'protected ' : v === '~' ? '' : 'public ');
const defaultReturn = (t: string) => (t === 'void' ? '' : /^(int|long|short|byte|double|float)$/.test(t) ? '    return 0;' : t === 'boolean' ? '    return false;' : '    return null;');

export function renderJava(m: UmlModel): string {
  const out: string[] = [];
  const pkgs = [...new Set(shown(m).map((c) => c.package).filter(Boolean))];
  if (pkgs.length === 1) out.push(`package ${pkgs[0]};`, '');
  const params = (ps: MemberDef['params'] = []) => ps.map((p) => `${javaType(p.type)} ${cleanName(p.name)}`).join(', ');
  for (const c of shown(m)) {
    const { ext, impl } = heritage(m, c);
    const gen = c.generics ? `<${c.generics}>` : '';
    if (c.kind === 'enum') {
      out.push(`public enum ${c.name} {`, `  ${c.attributes.map((a) => a.name).join(',\n  ')}`, '}', '');
      continue;
    }
    if (c.kind === 'interface') {
      const sup = [...ext, ...impl];
      out.push(`public interface ${c.name}${gen}${sup.length ? ` extends ${sup.join(', ')}` : ''} {`);
      for (const a of c.attributes) out.push(`  ${javaType(a.type)} ${a.name}${a.default ? ` = ${a.default}` : ''};`);
      for (const o of c.operations) out.push(`  ${javaType(o.type, 'void')} ${o.name}(${params(o.params)});`);
      out.push('}', '');
      continue;
    }
    const implementsList = [...ext.slice(1), ...impl];
    out.push(`public ${c.kind === 'abstract' ? 'abstract ' : ''}class ${c.name}${gen}${ext.length ? ` extends ${ext[0]}` : ''}${implementsList.length ? ` implements ${implementsList.join(', ')}` : ''} {`);
    for (const a of c.attributes) out.push(`  ${jVis(a.visibility).replace(/^public $/, 'public ')}${a.static ? 'static ' : ''}${javaType(a.type)} ${cleanName(a.name)}${a.default ? ` = ${a.default}` : ''};`);
    if (c.attributes.length && c.operations.length) out.push('');
    for (const o of c.operations) {
      const isCtor = o.name === c.name || o.name === '__init__';
      if (isCtor) { out.push(`  ${jVis(o.visibility)}${c.name}(${params(o.params)}) {`, '  }'); continue; }
      const ret = javaType(o.type, 'void');
      const head = `${jVis(o.visibility)}${o.static ? 'static ' : ''}${o.abstract ? 'abstract ' : ''}${ret} ${o.name}(${params(o.params)})`;
      if (o.abstract) out.push(`  ${head};`);
      else out.push(`  ${head} {`, ...(defaultReturn(ret) ? [`  ${defaultReturn(ret)}`] : []), '  }');
    }
    out.push('}', '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
