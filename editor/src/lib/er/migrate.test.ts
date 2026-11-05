import { describe, expect, it } from 'vitest';
import { migrationSql } from './migrate';
import { parseSql } from './sqlParse';

const s = (sql: string) => parseSql(sql).schema;

describe('migrationSql', () => {
  it('reports no changes for the same schema', () => {
    const a = s('CREATE TABLE users (id integer PRIMARY KEY);');
    expect(migrationSql(a, a, 'postgres')).toBe('-- no changes');
  });
  it('adds, alters and drops on postgres', () => {
    const a = s('CREATE TABLE users (id integer PRIMARY KEY, name text, old text);\nCREATE TABLE gone (id integer PRIMARY KEY);');
    const b = s('CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, email text);\nCREATE TABLE posts (id integer PRIMARY KEY, user_id integer REFERENCES users(id));');
    const sql = migrationSql(a, b, 'postgres');
    expect(sql).toContain('CREATE TABLE "posts"');
    expect(sql).toContain('ALTER TABLE "users" ADD COLUMN "email" text');
    expect(sql).toContain('ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;');
    expect(sql).toContain('ALTER TABLE "users" DROP COLUMN "old";');
    expect(sql).toContain('DROP TABLE "gone";');
  });
  it('uses MODIFY COLUMN on mysql', () => {
    const a = s('CREATE TABLE t (id int PRIMARY KEY, n varchar(10));');
    const b = s('CREATE TABLE t (id int PRIMARY KEY, n varchar(20));');
    expect(migrationSql(a, b, 'mysql')).toContain('MODIFY COLUMN `n` varchar(20)');
  });
});
