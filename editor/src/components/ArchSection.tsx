import { ARCH_ROLES, archOf, fieldsFor, hasArch, techOf, type ArchConfig, type ArchValue, type FieldDef } from '@core/arch';
import { roleOf } from '@core/lint';
import type { CNode } from '@core/types';
import { Field, Seg, SubHead } from './ui/Inspector';
import { Select } from './ui/Select';
import { t } from '../i18n';
import type { DiagramNode } from '../types';

/** does this node get an Architecture section (not client / monitoring / other)? */
export const hasArchSection = (node: DiagramNode): boolean => ARCH_ROLES.includes(roleOf(node as unknown as CNode));

/** Architecture config of a component: per-role and per-technology fields from the registry in core/arch, stored on `data.arch`. */
export function ArchSection({ node, readOnly, onChange }: { node: DiagramNode; readOnly?: boolean; onChange: (arch: ArchConfig | undefined) => void }) {
  const cn = node as unknown as CNode;
  const role = roleOf(cn);
  const tech = techOf(cn);
  const cur = archOf(cn, role);
  const stored = (hasArch(cn) ? node.data.arch : {}) as ArchConfig;
  const set = (key: string, v: ArchValue) => onChange({ ...stored, [key]: v });
  const { generic, tech: techFields } = fieldsFor(role, tech);
  const render = (f: FieldDef) => (
    <Field key={f.key} label={t(f.label)}>
      {f.kind === 'enum' ? (
        <Select label={t(f.label)} value={String(cur[f.key])} options={f.options!.map((o) => ({ value: o, label: o }))} onChange={(v) => !readOnly && set(f.key, v)} />
      ) : f.kind === 'bool' ? (
        <Seg label={t(f.label)} value={cur[f.key] ? 'on' : 'off'} options={[['on', t('On')], ['off', t('Off')]]} onChange={(v) => !readOnly && set(f.key, v === 'on')} />
      ) : (
        <input className="cap-field-input" type="number" min={f.min} max={f.max} step={1} aria-label={t(f.label)} value={Number(cur[f.key])} disabled={readOnly}
          onChange={(e) => e.target.value !== '' && set(f.key, Math.min(f.max ?? Infinity, Math.max(f.min ?? 0, Number(e.target.value))))} />
      )}
    </Field>
  );
  return (
    <div className="prop-body" data-testid="arch-section">
      {generic.map(render)}
      {techFields.length > 0 && <SubHead>{tech!.label}</SubHead>}
      {techFields.map(render)}
      {hasArch(cn) && !readOnly && <button type="button" className="btn-link" onClick={() => onChange(undefined)}>{t('Reset architecture')}</button>}
    </div>
  );
}
