import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { galleryKind, SEED_PROJECT, seedRows, templateSeedSql } from './seedSql';

describe('template gallery seed migration', () => {
  const rows = seedRows();
  it('maps every non-board template to a gallery lens', () => {
    expect(galleryKind(ALL_TEMPLATES.find((t) => t.id === 'board-kanban')!)).toBeNull();
    expect(galleryKind(ALL_TEMPLATES.find((t) => t.id === 'er-blog')!)).toBe('db');
    expect(galleryKind(ALL_TEMPLATES.find((t) => t.id === 'uml-strategy')!)).toBe('ood');
    expect(galleryKind(ALL_TEMPLATES.find((t) => t.id === 'seq-checkout')!)).toBe('ood');
    expect(galleryKind(ALL_TEMPLATES.find((t) => t.id === 'aws-3-tier')!)).toBe('system');
    expect(rows.length).toBe(ALL_TEMPLATES.filter((t) => !t.id.startsWith('board-')).length);
  });
  it('uses stable, unique backend ids', () => {
    for (const k of ['templateId', 'fileId', 'versionId'] as const) {
      const ids = rows.map((r) => r[k]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^(tpl|fil|ver)_[0-9a-f]{16}$/);
    }
    expect(SEED_PROJECT).toMatch(/^prj_[0-9a-f]{16}$/);
    expect(seedRows()[0].fileId).toBe(rows[0].fileId);
  });
  it('emits a version-2 document with one page per template, inside title / description limits', () => {
    for (const r of rows) {
      const pages = r.data.pages as { id: string }[];
      expect(r.data.version).toBe(2);
      expect(r.data.activePageId).toBe(pages[0].id);
      expect(r.title.length).toBeLessThanOrEqual(120);
      expect(r.description.length).toBeLessThanOrEqual(500);
    }
  });
  it('renders an idempotent goose migration', () => {
    const sql = templateSeedSql();
    expect(sql.startsWith('-- +goose Up')).toBe(true);
    expect(sql).toContain('-- +goose Down');
    expect(sql.match(/INSERT INTO dg_templates/g)?.length).toBe(rows.length);
    expect(sql.match(/ON CONFLICT \(id\) DO NOTHING/g)?.length).toBe(1 + rows.length * 3);
    if (process.env.SEED_OUT) writeFileSync(process.env.SEED_OUT, sql);
  });
});
