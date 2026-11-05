/** viewer < commenter < editor < owner. A commenter can comment but not edit; every "read-only" check is `!canEdit(role)`. */
export type Role = 'viewer' | 'commenter' | 'editor' | 'owner';
export const ROLES: readonly Role[] = ['viewer', 'commenter', 'editor', 'owner'];
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const canEdit = (r: Role): boolean => r === 'editor' || r === 'owner';
export const canComment = (r: Role): boolean => r === 'commenter' || canEdit(r);
export const roleLabel = (r: Role): string => ({ viewer: 'Can view', commenter: 'Can comment', editor: 'Can edit', owner: 'Owner' })[r];
