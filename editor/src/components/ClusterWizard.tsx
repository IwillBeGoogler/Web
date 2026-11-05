import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import { getProfile } from '../clusters/profiles';
import type { ClusterProfile, FieldSpec, Topic } from '../clusters/profiles/types';
import { buildThumbnail } from '../lib/thumbnail';
import { IconGlyph } from './IconGlyph';
import { Modal } from './ui/Modal';
import { Toggle } from './ui/Toggle';
import { t } from '../i18n';

type Params = Record<string, unknown>;

function TopicsEditor({ value, onChange }: { value: Topic[]; onChange: (t: Topic[]) => void }) {
  const set = (i: number, patch: Partial<Topic>) => onChange(value.map((tp, j) => (j === i ? { ...tp, ...patch } : tp)));
  return (
    <div className="topics">
      {value.map((tp, i) => (
        <div className="topic-row" key={i}>
          <input type="text" aria-label={t('Topic name {n}', { n: i + 1 })} value={tp.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input type="number" min={1} max={256} aria-label={t('Topic {n} partitions', { n: i + 1 })} value={tp.partitions} onChange={(e) => set(i, { partitions: Number(e.target.value) || 1 })} title={t('partitions')} />
          <input type="number" min={1} max={12} aria-label={t('Topic {n} replication factor', { n: i + 1 })} value={tp.rf} onChange={(e) => set(i, { rf: Number(e.target.value) || 1 })} title={t('replication factor')} />
          <button type="button" className="btn btn-icon btn-ghost" aria-label={t('Remove topic {n}', { n: i + 1 })} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { name: `topic-${value.length + 1}`, partitions: 3, rf: 3 }])}><Plus size={13} aria-hidden /> {t('Add topic')}</button>
    </div>
  );
}

function Field({ f, params, onChange }: { f: FieldSpec; params: Params; onChange: (v: unknown) => void }) {
  if (f.showIf && !f.showIf(params)) return null;
  const v = params[f.key];
  if (f.type === 'boolean') return <Toggle label={t(f.label)} checked={!!v} onChange={onChange} />;
  return (
    <div className="prop-row">
      <span className="prop-label">{t(f.label)}</span>
      {f.type === 'number' && <input type="number" aria-label={t(f.label)} min={f.min} max={f.max} value={Number(v)} onChange={(e) => onChange(Number(e.target.value))} />}
      {f.type === 'select' && (
        <select aria-label={t(f.label)} value={String(v)} onChange={(e) => onChange(typeof f.default === 'number' ? Number(e.target.value) : e.target.value)}>
          {f.options.map((o) => (<option key={String(o.value)} value={String(o.value)}>{t(o.label)}</option>))}
        </select>
      )}
      {f.type === 'text' && <input type="text" aria-label={t(f.label)} value={String(v ?? '')} onChange={(e) => onChange(e.target.value)} />}
      {f.type === 'topics' && <TopicsEditor value={(v as Topic[]) ?? []} onChange={onChange} />}
    </div>
  );
}

/** Generic wizard: renders the params form from the profile's field specs and previews the generated layout live. */
function WizardBody({ profile, initial, submitLabel, onSubmit, onCancel }: { profile: ClusterProfile; initial: Params; submitLabel: string; onSubmit: (p: Params) => void; onCancel: () => void }) {
  const [params, setParams] = useState<Params>(initial);
  const parsed = useMemo(() => profile.schema.safeParse(params), [profile, params]);
  const preview = useMemo(() => {
    if (!parsed.success) return '';
    const g = profile.generate(parsed.data as Params, 'preview');
    return buildThumbnail(g.nodes, g.edges, { width: 380, height: 240 });
  }, [parsed, profile]);
  const warnings = parsed.success ? profile.validate(parsed.data as Params) : [];
  return (
    <div className="wizard">
      <div className="wizard-form">
        {profile.fields.map((f) => (
          <Field key={f.key} f={f} params={params} onChange={(v) => setParams((p) => ({ ...p, [f.key]: v }))} />
        ))}
      </div>
      <div className="wizard-side">
        <div className="project-thumb wizard-preview" aria-label={t('Preview')} dangerouslySetInnerHTML={{ __html: preview }} />
        {parsed.success ? <div className="wizard-summary">{profile.summarize(parsed.data as Params)}</div> : <div className="error">{t('Invalid parameters')}</div>}
        {warnings.length > 0 && (
          <ul className="wizard-warnings" aria-label={t('Warnings')}>
            {warnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        )}
      </div>
      <div className="modal-foot wizard-foot">
        <button type="button" onClick={onCancel}>{t('Cancel')}</button>
        <button type="button" className="primary" disabled={!parsed.success} onClick={() => parsed.success && onSubmit(parsed.data as Params)}>{submitLabel}</button>
      </div>
    </div>
  );
}

export function ClusterWizard() {
  const wizard = useUiStore((s) => s.wizard);
  const setWizard = useUiStore((s) => s.setWizard);
  const createCluster = useDiagramStore((s) => s.createCluster);
  const updateCluster = useDiagramStore((s) => s.updateCluster);
  const root = useDiagramStore((s) => (wizard?.clusterId ? s.nodes.find((n) => n.id === wizard.clusterId) : undefined));
  const profile = wizard?.profileId ? getProfile(wizard.profileId) : root?.data.profileId ? getProfile(root.data.profileId) : undefined;
  const close = () => setWizard(null);
  const editing = !!wizard?.clusterId;
  const initial: Params = profile ? { ...profile.defaults, ...((editing ? root?.data.params : undefined) ?? {}) } : {};
  return (
    <Modal open={!!wizard && !!profile} title={profile ? t(editing ? 'Edit {tech} cluster' : 'New {tech} cluster', { tech: profile.tech }) : t('Cluster')} onClose={close} className="wizard-modal">
      {profile && wizard && (
        <>
          <div className="wizard-head"><IconGlyph iconId={profile.iconId} size={28} /> <span className="muted">{profile.label}</span></div>
          <WizardBody
            key={`${wizard.profileId ?? ''}${wizard.clusterId ?? ''}`}
            profile={profile}
            initial={initial}
            submitLabel={editing ? t('Apply') : t('Create')}
            onCancel={close}
            onSubmit={(p) => {
              if (editing && wizard.clusterId) updateCluster(wizard.clusterId, p);
              else createCluster(profile.id, p, wizard.at);
              close();
            }}
          />
        </>
      )}
    </Modal>
  );
}
