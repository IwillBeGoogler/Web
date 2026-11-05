import { describe, expect, it } from 'vitest';
import { renderJava, renderTypeScript } from './skeleton';
import { parseTypeScript } from './typescript';
import { parseJava } from './java';
import { newClassDef, type UmlModel } from './model';

const model = (): UmlModel => ({
  classes: [
    newClassDef('Drawable', { kind: 'interface', operations: [{ visibility: '+', name: 'draw', params: [], type: 'void' }] }),
    newClassDef('Shape', {
      kind: 'abstract', generics: 'T',
      attributes: [{ visibility: '-', name: 'count', type: 'number', static: true, default: '0' }, { visibility: '#', name: 'name', type: 'string' }],
      operations: [
        { visibility: '+', name: 'Shape', params: [{ name: 'name', type: 'string' }] },
        { visibility: '+', name: 'area', params: [], type: 'number', abstract: true },
        { visibility: '+', name: 'create', params: [{ name: 'kind', type: 'string' }], type: 'Shape', static: true },
      ],
    }),
    newClassDef('Circle', { attributes: [{ visibility: '+', name: 'radius', type: 'number' }], operations: [{ visibility: '+', name: 'area', params: [], type: 'number' }] }),
    newClassDef('Color', { kind: 'enum', attributes: [{ visibility: '', name: 'RED' }, { visibility: '', name: 'GREEN' }] }),
  ],
  relations: [
    { from: 'Circle', to: 'Shape', kind: 'inheritance' },
    { from: 'Circle', to: 'Drawable', kind: 'realization' },
  ],
});

describe('TypeScript skeleton export', () => {
  const text = renderTypeScript(model());
  it('writes interfaces, abstract classes, enums, generics, heritage and modifiers', () => {
    expect(text).toContain('export interface Drawable {');
    expect(text).toContain('draw(): void;');
    expect(text).toContain('export abstract class Shape<T> {');
    expect(text).toContain('private static count: number = 0;');
    expect(text).toContain('protected name: string;');
    expect(text).toContain('abstract area(): number;');
    expect(text).toContain('static create(kind: string): Shape {');
    expect(text).toContain('constructor(name: string) {');
    expect(text).toContain('export class Circle extends Shape implements Drawable {');
    expect(text).toContain('export enum Color {');
    expect(text).toMatch(/RED,\s+GREEN,/);
  });
  it('parses back with the TypeScript importer', async () => {
    const back = (await parseTypeScript(text, { associations: false })).model;
    const shape = back.classes.find((c) => c.name === 'Shape')!;
    expect(shape).toMatchObject({ kind: 'abstract', generics: 'T' });
    expect(shape.attributes.map((a) => [a.visibility, a.name, a.static ?? false])).toEqual([['-', 'count', true], ['#', 'name', false]]);
    expect(shape.operations.map((o) => o.name)).toEqual(['Shape', 'area', 'create']);
    expect(back.relations).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'Circle', to: 'Shape', kind: 'inheritance' }), expect.objectContaining({ from: 'Circle', to: 'Drawable', kind: 'realization' })]));
    expect(back.classes.find((c) => c.name === 'Color')!.attributes.map((a) => a.name)).toEqual(['RED', 'GREEN']);
  });
});

describe('Java skeleton export', () => {
  const text = renderJava(model());
  it('writes interfaces, abstract classes, enums, generics, heritage and modifiers', () => {
    expect(text).toContain('public interface Drawable {');
    expect(text).toContain('void draw();');
    expect(text).toContain('public abstract class Shape<T> {');
    expect(text).toContain('private static double count = 0;');
    expect(text).toContain('protected String name;');
    expect(text).toContain('public abstract double area();');
    expect(text).toContain('public static Shape create(String kind) {');
    expect(text).toContain('public Shape(String name) {');
    expect(text).toContain('public class Circle extends Shape implements Drawable {');
    expect(text).toContain('public enum Color {');
    expect(text).toMatch(/RED,\s+GREEN/);
  });
  it('parses back with the Java importer', () => {
    const back = parseJava(text).model;
    expect(back.classes.find((c) => c.name === 'Shape')).toMatchObject({ kind: 'abstract', generics: 'T' });
    expect(back.classes.find((c) => c.name === 'Shape')!.operations.map((o) => o.name)).toEqual(['Shape', 'area', 'create']);
    expect(back.relations).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'Circle', to: 'Shape', kind: 'inheritance' }), expect.objectContaining({ from: 'Circle', to: 'Drawable', kind: 'realization' })]));
  });
  it('maps TypeScript primitive types', () => {
    expect(text).not.toMatch(/\bnumber\b|\bstring\b/);
  });
});
