import { describe, expect, it } from 'vitest';
import { canComment, canEdit, isRole, roleLabel } from './roles';

describe('roles', () => {
  it('only editors and owners edit; commenters, editors and owners comment', () => {
    expect(['viewer', 'commenter', 'editor', 'owner'].map((r) => canEdit(r as never))).toEqual([false, false, true, true]);
    expect(['viewer', 'commenter', 'editor', 'owner'].map((r) => canComment(r as never))).toEqual([false, true, true, true]);
  });
  it('isRole / roleLabel', () => {
    expect(isRole('commenter')).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(roleLabel('commenter')).toBe('Can comment');
  });
});
