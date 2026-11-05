import { addRelation, baseName, emptyModel, ensureClass, newClassDef, type MemberDef, type UmlClassDef, type UmlParseResult } from './model';
import type { Visibility } from './types';

export interface TsImportOptions {
  /** typed members that reference another declared class become association edges (default true) */
  associations?: boolean;
}

type TS = typeof import('@typescript/typescript6');
let tsPromise: Promise<TS> | null = null;
/** The compiler API is ~9 MB: it is only fetched when someone imports TypeScript. */
export function loadTypeScript(): Promise<TS> {
  tsPromise ??= import('@typescript/typescript6').then((m) => ((m as unknown as { default?: TS }).default ?? m) as TS);
  return tsPromise;
}

const COLLECTIONS = new Set(['Array', 'ReadonlyArray', 'Set', 'ReadonlySet', 'Iterable', 'Collection', 'List', 'Queue', 'Stack']);
const MAPS = new Set(['Map', 'ReadonlyMap', 'Record', 'WeakMap']);
const WRAPPERS = new Set(['Promise', 'Readonly', 'Partial', 'Required', 'NonNullable', 'Awaited', 'Observable', 'Ref', 'Signal']);

export async function parseTypeScript(src: string, opts: TsImportOptions = {}): Promise<UmlParseResult> {
  const ts = await loadTypeScript();
  const warnings: string[] = [];
  const model = emptyModel();
  const sf = ts.createSourceFile('input.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diags = (sf as unknown as { parseDiagnostics?: { messageText: unknown; start?: number }[] }).parseDiagnostics ?? [];
  for (const d of diags.slice(0, 5)) {
    const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
    warnings.push(`Syntax problem${line ? ` on line ${line}` : ''}: ${ts.flattenDiagnosticMessageText(d.messageText as never, ' ')}`);
  }
  const text = (n: import('@typescript/typescript6').Node) => n.getText(sf);
  const flagsOf = (n: import('@typescript/typescript6').Node) => {
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : [];
    const has = (k: import('@typescript/typescript6').SyntaxKind) => mods.some((m) => m.kind === k);
    const visibility: Visibility = has(ts.SyntaxKind.PrivateKeyword) ? '-' : has(ts.SyntaxKind.ProtectedKeyword) ? '#' : '+';
    return { visibility, isStatic: has(ts.SyntaxKind.StaticKeyword), isAbstract: has(ts.SyntaxKind.AbstractKeyword), isReadonly: has(ts.SyntaxKind.ReadonlyKeyword), hasAccess: has(ts.SyntaxKind.PrivateKeyword) || has(ts.SyntaxKind.ProtectedKeyword) || has(ts.SyntaxKind.PublicKeyword) };
  };
  const nameOf = (n: import('@typescript/typescript6').PropertyName | undefined): { name: string; priv: boolean } => {
    if (!n) return { name: '?', priv: false };
    if (ts.isPrivateIdentifier(n)) return { name: text(n).slice(1), priv: true };
    return { name: ts.isStringLiteral(n) ? n.text : text(n), priv: false };
  };
  const params = (ps: readonly import('@typescript/typescript6').ParameterDeclaration[]) =>
    ps.map((p) => {
      const pn = text(p.name);
      const type = p.type ? text(p.type) : p.initializer && !p.dotDotDotToken ? inferLiteral(p.initializer) : undefined;
      return { name: `${p.dotDotDotToken ? '...' : ''}${pn}${p.questionToken ? '?' : ''}`, ...(type ? { type } : {}) };
    });
  const inferLiteral = (e: import('@typescript/typescript6').Expression): string | undefined =>
    ts.isStringLiteralLike(e) ? 'string' : ts.isNumericLiteral(e) ? 'number' : e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword ? 'boolean' : undefined;

  const declared = new Set<string>();
  const pending: { owner: string; role: string; node: import('@typescript/typescript6').TypeNode; optional?: boolean }[] = [];

  const heritage = (c: UmlClassDef, node: import('@typescript/typescript6').ClassLikeDeclaration | import('@typescript/typescript6').InterfaceDeclaration) => {
    for (const h of node.heritageClauses ?? []) {
      const impl = h.token === ts.SyntaxKind.ImplementsKeyword;
      for (const t of h.types) {
        const to = baseName(text(t.expression));
        if (!model.classes.some((x) => x.name === to)) ensureClass(model, to, { external: true });
        addRelation(model, { from: c.name, to, kind: impl ? 'realization' : 'inheritance' });
      }
    }
  };

  const declare = (name: string, pkg: string | undefined, extra: Partial<UmlClassDef>): UmlClassDef => {
    const existing = model.classes.find((c) => c.name === name);
    const c = existing ?? newClassDef(name);
    if (!existing) model.classes.push(c);
    Object.assign(c, extra);
    delete c.external;
    if (pkg) c.package = pkg;
    declared.add(name);
    return c;
  };
  const typeParams = (n: { typeParameters?: import('@typescript/typescript6').NodeArray<import('@typescript/typescript6').TypeParameterDeclaration> }) => (n.typeParameters?.length ? n.typeParameters.map(text).join(', ') : undefined);

  const classMembers = (c: UmlClassDef, node: import('@typescript/typescript6').ClassLikeDeclaration | import('@typescript/typescript6').InterfaceDeclaration, isInterface: boolean) => {
    for (const m of node.members) {
      const f = flagsOf(m);
      if (ts.isPropertyDeclaration(m) || ts.isPropertySignature(m)) {
        const { name, priv } = nameOf(m.name);
        const init = ts.isPropertyDeclaration(m) ? m.initializer : undefined;
        const type = m.type ? text(m.type) : init ? inferLiteral(init) : undefined;
        const def: MemberDef = { visibility: priv ? '-' : f.visibility, name: m.questionToken ? `${name}?` : name, ...(type ? { type } : {}), ...(f.isStatic ? { static: true } : {}), ...(init ? { default: text(init) } : {}) };
        c.attributes.push(def);
        if (m.type) pending.push({ owner: c.name, role: name, node: m.type, optional: !!m.questionToken });
      } else if (ts.isGetAccessor(m)) {
        const { name, priv } = nameOf(m.name);
        c.attributes.push({ visibility: priv ? '-' : f.visibility, name, ...(m.type ? { type: text(m.type) } : {}), ...(f.isStatic ? { static: true } : {}) });
        if (m.type) pending.push({ owner: c.name, role: name, node: m.type });
      } else if (ts.isSetAccessor(m)) {
        continue;
      } else if (ts.isConstructorDeclaration(m)) {
        for (const p of m.parameters) {
          const pf = flagsOf(p);
          if (pf.hasAccess || pf.isReadonly) {
            const { name } = nameOf(p.name as import('@typescript/typescript6').PropertyName);
            c.attributes.push({ visibility: pf.visibility, name, ...(p.type ? { type: text(p.type) } : {}) });
            if (p.type) pending.push({ owner: c.name, role: name, node: p.type });
          }
        }
        c.operations.push({ visibility: f.visibility, name: c.name, params: params(m.parameters) });
      } else if (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) {
        const { name, priv } = nameOf(m.name);
        c.operations.push({
          visibility: priv ? '-' : f.visibility, name: m.questionToken ? `${name}?` : name, params: params(m.parameters),
          ...(m.type ? { type: text(m.type) } : {}),
          ...(f.isStatic ? { static: true } : {}),
          ...(f.isAbstract ? { abstract: true } : {}),
        });
      }
    }
    void isInterface;
  };

  const visit = (node: import('@typescript/typescript6').Node, pkg: string | undefined) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const abstract = flagsOf(node).isAbstract;
      const c = declare(node.name.text, pkg, { kind: abstract ? 'abstract' : 'class', generics: typeParams(node), attributes: [], operations: [] });
      if (!c.generics) delete c.generics;
      heritage(c, node);
      classMembers(c, node, false);
      return;
    }
    if (ts.isInterfaceDeclaration(node)) {
      const c = declare(node.name.text, pkg, { kind: 'interface', generics: typeParams(node), attributes: [], operations: [] });
      if (!c.generics) delete c.generics;
      heritage(c, node);
      classMembers(c, node, true);
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      declare(node.name.text, pkg, { kind: 'enum', attributes: node.members.map((m) => ({ visibility: '' as Visibility, name: text(m.name).replace(/^['"]|['"]$/g, '') })), operations: [] });
      return;
    }
    if (ts.isModuleDeclaration(node) && node.body) {
      const name = text(node.name).replace(/^['"]|['"]$/g, '');
      if (ts.isModuleBlock(node.body)) node.body.statements.forEach((s) => visit(s, pkg ? `${pkg}.${name}` : name));
      else visit(node.body, pkg ? `${pkg}.${name}` : name);
      return;
    }
    if (ts.isSourceFile(node) || ts.isBlock(node)) ts.forEachChild(node, (c) => visit(c, pkg));
  };
  visit(sf, undefined);

  if (opts.associations !== false) {
    const refs = (t: import('@typescript/typescript6').TypeNode, mult: string): { name: string; mult: string }[] => {
      if (ts.isParenthesizedTypeNode(t)) return refs(t.type, mult);
      if (ts.isTypeOperatorNode(t)) return refs(t.type, mult);
      if (ts.isArrayTypeNode(t)) return refs(t.elementType, '0..*');
      if (ts.isUnionTypeNode(t)) {
        const parts = t.types.filter((x) => !(x.kind === ts.SyntaxKind.UndefinedKeyword || x.kind === ts.SyntaxKind.NullKeyword || (ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword)));
        const optional = parts.length < t.types.length;
        return parts.flatMap((p) => refs(p, optional && mult === '1' ? '0..1' : mult));
      }
      if (ts.isTypeReferenceNode(t)) {
        const n = baseName(text(t.typeName));
        const args = t.typeArguments ?? [];
        if (COLLECTIONS.has(n)) return args.flatMap((a) => refs(a, '0..*'));
        if (MAPS.has(n)) return args.length ? refs(args[args.length - 1], '0..*') : [];
        if (WRAPPERS.has(n)) return args.flatMap((a) => refs(a, mult));
        return declared.has(n) ? [{ name: n, mult }] : [];
      }
      return [];
    };
    for (const p of pending) {
      for (const r of refs(p.node, p.optional ? '0..1' : '1')) {
        if (r.name === p.owner && !model.classes.find((c) => c.name === p.owner)) continue;
        addRelation(model, { from: p.owner, to: r.name, kind: 'association', directed: true, toMult: r.mult, toRole: p.role });
      }
    }
  }
  return { model, warnings };
}
