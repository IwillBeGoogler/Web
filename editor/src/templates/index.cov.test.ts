import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES, registerTemplates, type Template } from './index';

const mk = (id: string): Template => ({ id, name: id, build: () => ({}) as never });

describe('templates registry', () => {
  it('registers new templates once and ignores duplicate ids', () => {
    const before = ALL_TEMPLATES.length;
    registerTemplates([mk('cov-a'), mk('cov-b'), mk('cov-a')]);
    expect(ALL_TEMPLATES.length).toBe(before + 2);
    registerTemplates([mk('cov-a')]);
    expect(ALL_TEMPLATES.length).toBe(before + 2);
    expect(ALL_TEMPLATES.filter((t) => t.id === 'cov-a')).toHaveLength(1);
  });
  it('ships built-in templates with unique ids', () => {
    const ids = ALL_TEMPLATES.map((t) => t.id);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
