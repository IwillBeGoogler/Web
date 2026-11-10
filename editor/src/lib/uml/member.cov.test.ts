import { describe, expect, it } from 'vitest';
import { displayName, formatAttribute, formatOperation, memberText, parseMember, splitTop, visibilityLabel } from './member';
import type { Visibility } from './types';

describe('member cov', () => {
  it('visibilityLabel falls back to default', () => {
    expect(visibilityLabel('#')).toBe('protected');
    expect(visibilityLabel('' as Visibility)).toBe('default');
  });
  it('displayName', () => {
    expect(displayName({ label: 'A', generics: ' T ' })).toBe('A<T>');
    expect(displayName({ label: 'A', generics: '  ' })).toBe('A');
    expect(displayName({ label: 'A' })).toBe('A');
  });
  it('splitTop keeps arrows and nested brackets, handles trailing empty', () => {
    expect(splitTop('a: (x) => y, b: Map<K, V>')).toEqual(['a: (x) => y', 'b: Map<K, V>']);
    expect(splitTop('a, b,')).toEqual(['a', 'b']);
    expect(splitTop('a)), b')).toEqual(['a))', 'b']);
  });
  it('formatters', () => {
    expect(formatAttribute({ id: '1', visibility: '', name: 'x' })).toBe('x');
    expect(formatAttribute({ id: '1', visibility: '-', name: 'x', type: 'T', default: '1' })).toBe('- x: T = 1');
    expect(formatOperation({ id: '1', visibility: '+', name: 'f' })).toBe('+ f()');
    expect(memberText({ id: '1', visibility: '+', name: 'f', params: [{ name: 'a' }, { name: 'b', type: 'B' }], type: 'R', static: true, abstract: true }, 'operation')).toBe('static abstract + f(a, b: B): R');
    expect(memberText({ id: '1', visibility: '+', name: 'x' }, 'attribute')).toBe('+ x');
  });
  it('parseMember attribute modifiers before and after visibility', () => {
    expect(parseMember('static - id: number = 0', 'attribute')).toEqual({ visibility: '-', name: 'id', type: 'number', default: '0', static: true });
    expect(parseMember('+ abstract STATIC x', 'attribute')).toEqual({ visibility: '+', name: 'x', static: true, abstract: true });
    expect(parseMember('plain', 'attribute')).toEqual({ visibility: '+', name: 'plain' });
    expect(parseMember('=', 'attribute')).toMatchObject({ visibility: '+' });
  });
  it('parseMember operations', () => {
    expect(parseMember('abstract # run(a: A, b): R', 'operation')).toEqual({ visibility: '#', name: 'run', params: [{ name: 'a', type: 'A' }, { name: 'b' }], type: 'R', abstract: true });
    expect(parseMember('go: X', 'operation')).toEqual({ visibility: '+', name: 'go', params: [], type: 'X' });
    expect(parseMember('go', 'operation')).toEqual({ visibility: '+', name: 'go', params: [] });
    expect(parseMember('f(a: (x) => y', 'operation')).toMatchObject({ name: 'f', params: [{ name: 'a', type: '(x) => y' }] });
    expect(parseMember('f(g(x): int)', 'operation')).toMatchObject({ name: 'f', params: [{ name: 'g(x)', type: 'int' }] });
  });
});
