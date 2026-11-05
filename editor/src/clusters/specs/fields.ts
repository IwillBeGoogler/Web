import type { FieldSpec } from '../profiles/types';

export const text = (key: string, label: string, def: string, showIf?: (p: Record<string, unknown>) => boolean): FieldSpec => ({ key, type: 'text', label, default: def, ...(showIf ? { showIf } : {}) });
