import { describe, expect, it } from 'vitest';
import { formatAttribute, formatOperation, formatParams, memberText, parseMember, splitTop, displayName, visibilityLabel } from './member';
import type { ClassMember } from './types';

const m = (x: Partial<ClassMember>): ClassMember => ({ id: 'm0', visibility: '+', name: 'x', ...x });

describe('UML member text', () => {
  it('formats attributes with visibility, type and default', () => {
    expect(formatAttribute(m({ name: 'id', type: 'number', visibility: '-' }))).toBe('- id: number');
    expect(formatAttribute(m({ name: 'count', type: 'int', default: '0' }))).toBe('+ count: int = 0');
    expect(formatAttribute(m({ name: 'x', visibility: '' }))).toBe('x');
    expect(formatAttribute(m({ name: 'tags', type: 'Map<string, number>', visibility: '#' }))).toBe('# tags: Map<string, number>');
  });
  it('formats operations with params and return type', () => {
    expect(formatOperation(m({ name: 'save', params: [{ name: 'item', type: 'T' }], type: 'void' }))).toBe('+ save(item: T): void');
    expect(formatOperation(m({ name: 'find', params: [{ name: 'id', type: 'string' }, { name: 'deep' }], type: 'Promise<T>' }))).toBe('+ find(id: string, deep): Promise<T>');
    expect(formatOperation(m({ name: 'Foo', params: [], visibility: '~' }))).toBe('~ Foo()');
  });
  it('knows the visibility symbols', () => {
    expect(visibilityLabel('+')).toBe('public');
    expect(visibilityLabel('-')).toBe('private');
    expect(visibilityLabel('#')).toBe('protected');
    expect(visibilityLabel('~')).toBe('package');
  });
  it('displayName appends generics', () => {
    expect(displayName({ label: 'Repository', generics: 'T' })).toBe('Repository<T>');
    expect(displayName({ label: 'Map', generics: 'K, V' })).toBe('Map<K, V>');
    expect(displayName({ label: 'Plain' })).toBe('Plain');
  });
  it('splitTop splits at top-level commas only', () => {
    expect(splitTop('a: Map<K, V>, b: (x: number, y: number) => void, c')).toEqual(['a: Map<K, V>', 'b: (x: number, y: number) => void', 'c']);
    expect(splitTop('')).toEqual([]);
  });
  it('parses attributes', () => {
    expect(parseMember('- id: number', 'attribute')).toMatchObject({ visibility: '-', name: 'id', type: 'number' });
    expect(parseMember('count: int = 0', 'attribute')).toMatchObject({ visibility: '+', name: 'count', type: 'int', default: '0' });
    expect(parseMember('static # instance: Foo', 'attribute')).toMatchObject({ visibility: '#', name: 'instance', type: 'Foo', static: true });
    expect(parseMember('name', 'attribute')).toMatchObject({ name: 'name' });
  });
  it('parses operations', () => {
    expect(parseMember('+ save(item: T): void', 'operation')).toMatchObject({ visibility: '+', name: 'save', params: [{ name: 'item', type: 'T' }], type: 'void' });
    expect(parseMember('abstract # run(a: Map<K, V>, b)', 'operation')).toMatchObject({ visibility: '#', name: 'run', abstract: true, params: [{ name: 'a', type: 'Map<K, V>' }, { name: 'b' }] });
    expect(parseMember('static ~ create(): Foo', 'operation')).toMatchObject({ static: true, visibility: '~', name: 'create', type: 'Foo', params: [] });
  });
  it('an operation without parentheses gets an empty parameter list', () => {
    expect(parseMember('doIt', 'operation')).toMatchObject({ name: 'doIt', params: [] });
  });
  it('round-trips memberText -> parseMember', () => {
    for (const x of [m({ name: 'a', type: 'T', visibility: '-', static: true }), m({ name: 'b', default: '1', type: 'number' })]) {
      const back = parseMember(memberText(x, 'attribute'), 'attribute');
      expect(back).toMatchObject({ name: x.name, type: x.type, visibility: x.visibility, ...(x.default ? { default: x.default } : {}) });
      expect(!!back.static).toBe(!!x.static);
    }
    const op = m({ name: 'op', params: [{ name: 'a', type: 'A' }], type: 'R', abstract: true });
    expect(parseMember(memberText(op, 'operation'), 'operation')).toMatchObject({ name: 'op', params: [{ name: 'a', type: 'A' }], type: 'R', abstract: true });
  });
  it('formatParams', () => {
    expect(formatParams([{ name: 'a', type: 'A' }, { name: 'b' }])).toBe('a: A, b');
  });
});
