import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Link2, Trash2, Upload, UserPlus } from 'lucide-react';
import { initials } from '../../api/session';
import { usePresence } from '../../sync/status';
import { colorForUser } from '../../collab/presenceMath';
import { useSmart } from '../../store/smartStore';
import { describeChange, diffProjects, diffSummary, type DocDiff } from '../../lib/versionDiff';
import { useDiffStore } from '../../versions/diffStore';
import type { Project } from '../../types';
import { ApiError } from '../../api/client';
import { api, type Api } from '../../api/api';
import type { Member, Role, ShareLink, VersionMeta } from '../../api/types';
import { dialogs, type CustomApi } from '../../lib/dialogs';
import { formatRelative } from '../../lib/home';
import type { ConflictChoice, ConflictInfo, Saved } from '../../sync/engine';
import { toast } from '../../store/toastStore';
import { canEdit } from '../../lib/roles';
import { buildShareLink, isEmbedded } from '../../lib/host';
import { t } from '../../i18n';

// ---- conflict (412) ------------------------------------------------------------------------------
/** who changed the file and when: an avatar, the name and a relative time */
function ConflictMessage({ info }: { info: ConflictInfo }) {
  const [showDiff, setShowDiff] = useState(false);
  const diff = useMemo(() => (info.mine.doc && info.theirs.doc ? diffProjects(info.theirs.doc, info.mine.doc) : null), [info]);
  return createElement(
    'div',
    { className: 'conflict-msg' },
    createElement('div', { className: 'conflict-who' },
      createElement('span', { className: 'avatar', style: { background: colorForUser(info.theirs.byId ?? info.theirs.by), width: 30, height: 30 }, 'aria-hidden': true }, initials(info.theirs.by)),
      createElement('span', null, t('“{name}” was saved by ', { name: info.name }), createElement('strong', null, info.theirs.by), ' ', createElement('time', { dateTime: new Date(info.theirs.updatedAt).toISOString() }, formatRelative(info.theirs.updatedAt)), t(' while you were editing. Choose which version to keep.')),
    ),
    diff
      ? createElement('button', { type: 'button', className: 'conflict-diff-link', onClick: () => setShowDiff((v) => !v), 'aria-expanded': showDiff }, showDiff ? t('Hide differences') : t('View differences'))
      : null,
    diff && showDiff
      ? createElement('ul', { className: 'conflict-diff', 'aria-label': t('Differences between their version and yours') },
          createElement('li', null, t('Yours compared to theirs: {summary}', { summary: diffSummary(diff) })),
          ...diff.nodes.added.slice(0, 6).map((n) => createElement('li', { key: `a${n.id}`, className: 'add' }, `+ ${labelOf(n)} ${t('(only in yours)')}`)),
          ...diff.nodes.removed.slice(0, 6).map((n) => createElement('li', { key: `r${n.id}`, className: 'rem' }, `− ${labelOf(n)} ${t('(only in theirs)')}`)),
          ...diff.nodes.changed.slice(0, 6).map((c) => createElement('li', { key: `c${c.id}`, className: 'chg' }, `~ ${labelOf(c.after)}: ${describeChange(c)}`)),
        )
      : null,
  );
}
const labelOf = (n: { id: string; data?: unknown }): string => String((n.data as { label?: unknown } | undefined)?.label || n.id);

/** "Keep mine / Take theirs / Save as copy"; null = decide later. Never shown for live (Yjs) files: their merges are automatic. */
export function conflictDialog(info: ConflictInfo): Promise<ConflictChoice | null> {
  return dialogs.choose<ConflictChoice>({
    title: t('This file changed on the server'),
    message: createElement(ConflictMessage, { info }),
    choices: [
      { value: 'mine', label: t('Keep mine'), description: t('Overwrite the server version with yours'), icon: createElement(Upload, { size: 15 }), variant: 'primary' },
      { value: 'theirs', label: t('Take theirs'), description: t('Replace your changes with their version'), icon: createElement(Download, { size: 15 }) },
      { value: 'copy', label: t('Save as copy'), description: t('Keep yours as a new file and load theirs here'), icon: createElement(Copy, { size: 15 }) },
    ],
    cancelLabel: t('Decide later'),
    confirmLabel: t('Apply'),
  });
}

const errText = (e: unknown): string => (e instanceof ApiError ? e.message : t('Something went wrong'));

// ---- share ---------------------------------------------------------------------------------------
export const EXPIRIES: [string, number | undefined][] = [['Never expires', undefined], ['1 day', 86400], ['7 days', 7 * 86400], ['30 days', 30 * 86400]];
export const shareUrl = (token: string, origin = window.location.origin): string => buildShareLink(token) ?? `${origin}/s/${token}`;

export function ShareForm({ projectId, fileId, fileName, role, client = api, done }: { projectId: string; /** the open file: offers a link to just this file */ fileId?: string; fileName?: string; role: Role; client?: Pick<Api, 'listShares' | 'createShare' | 'revokeShare' | 'listMembers' | 'addMember' | 'setMemberRole' | 'removeMember'>; done: () => void }) {
  const owner = role === 'owner';
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [linkRole, setLinkRole] = useState<'viewer' | 'commenter' | 'editor'>('viewer');
  const [expiry, setExpiry] = useState(0);
  const [scope, setScope] = useState<'file' | 'project'>(fileId ? 'file' : 'project');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'viewer' | 'commenter' | 'editor'>('editor');
  const online = usePresence((st) => st.users);
  const onlineIds = new Set(online.map((u) => u.userId).filter(Boolean));
  const peopleOnline = new Set(online.map((u) => u.userId ?? u.clientId)).size;
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (owner) setShares((await client.listShares(projectId)).filter((s) => !s.revokedAt));
      setMembers(await client.listMembers(projectId));
    } catch (e) {
      setError(errText(e));
    }
  }, [client, projectId, owner]);
  useEffect(() => void load(), [load]);

  const create = async () => {
    setError(null);
    try {
      const r = await client.createShare(projectId, linkRole, { expiresInSeconds: EXPIRIES[expiry][1], fileId: scope === 'file' ? fileId : undefined });
      setFresh(shareUrl(r.token));
      setCopied(false);
      void load();
    } catch (e) {
      setError(errText(e));
    }
  };
  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      toast.info(t('Copy failed: select the link and copy it manually'));
    }
  };
  const revoke = async (id: string) => {
    try {
      await client.revokeShare(projectId, id);
      setShares((l) => l.filter((s) => s.id !== id));
    } catch (e) {
      setError(errText(e));
    }
  };
  const add = async () => {
    setError(null);
    try {
      await client.addMember(projectId, email.trim(), memberRole);
      setEmail('');
      void load();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'USER_NOT_FOUND' ? t('No account with that email yet. Ask them to sign up first.') : errText(e));
    }
  };

  return (
    <div className="dialog-body share-form">
      {!owner && <p className="muted">{t('Only the project owner can create links or change who has access.')}</p>}
      {owner && (
        <section aria-labelledby="share-links-h">
          <h3 id="share-links-h"><Link2 size={14} aria-hidden /> {t('Share link')}</h3>
          <div className="share-row">
            {fileId && (
              <select aria-label={t('Link scope')} value={scope} onChange={(e) => setScope(e.target.value as 'file' | 'project')}>
                <option value="file">{t('This file')}{fileName ? `: ${fileName}` : ''}</option>
                <option value="project">{t('The whole project')}</option>
              </select>
            )}
            <select aria-label={t('Link access')} value={linkRole} onChange={(e) => setLinkRole(e.target.value as 'viewer' | 'commenter' | 'editor')}>
              <option value="viewer">{t('Anyone with the link can view')}</option>
              <option value="commenter">{t('Anyone with the link can comment')}</option>
              <option value="editor">{t('Anyone with the link can edit')}</option>
            </select>
            <select aria-label={t('Link expiry')} value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {EXPIRIES.map(([l], i) => <option key={l} value={i}>{t(l)}</option>)}
            </select>
            <button type="button" className="primary" onClick={() => void create()}>{t('Create link')}</button>
          </div>
          {fresh && (
            <div className="share-row">
              <input readOnly aria-label={t('Share link URL')} value={fresh} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={() => void copy()}>{copied ? <><Check size={14} aria-hidden /> {t('Copied')}</> : <><Copy size={14} aria-hidden /> {t('Copy')}</>}</button>
            </div>
          )}
          {fresh && <p className="muted">{t('Copy it now: for security the link is only shown once.')}</p>}
          <ul className="share-list" aria-label={t('Active links')}>
            {shares.map((s) => (
              <li key={s.id}>
                <span>{s.fileId ? t('File link') : t('Project link')} · {s.role === 'editor' ? t('Can edit') : s.role === 'commenter' ? t('Can comment') : t('Can view')} · {t('created {when}', { when: formatRelative(s.createdAt) })}{s.expiresAt ? ` · ${t('expires {when}', { when: formatRelative(s.expiresAt) })}` : ''}</span>
                <button type="button" aria-label={t('Revoke {role} link created {when}', { role: s.role, when: formatRelative(s.createdAt) })} onClick={() => void revoke(s.id)}><Trash2 size={14} aria-hidden /> {t('Revoke')}</button>
              </li>
            ))}
            {shares.length === 0 && <li className="muted">{t('No active links.')}</li>}
          </ul>
        </section>
      )}
      {online.length > 0 && (
        <p className="share-online" aria-label={t('Online now')}>
          <span className="online-dot" aria-hidden /> {peopleOnline === 1 ? t('1 person is') : t('{n} people are', { n: peopleOnline })} {t('in this file now:')}{' '}
          {[...new Set(online.map((u) => u.name || t('Guest')))].join(', ')}
        </p>
      )}
      <section aria-labelledby="share-people-h">
        <h3 id="share-people-h"><UserPlus size={14} aria-hidden /> {t('People')}</h3>
        {owner && (
          <form className="share-row" onSubmit={(e) => { e.preventDefault(); if (email.trim()) void add(); }}>
            <input type="email" aria-label={t('Invite by email')} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select aria-label={t('Member role')} value={memberRole} onChange={(e) => setMemberRole(e.target.value as 'viewer' | 'commenter' | 'editor')}>
              <option value="editor">{t('Can edit')}</option>
              <option value="commenter">{t('Can comment')}</option>
              <option value="viewer">{t('Can view')}</option>
            </select>
            <button type="submit" disabled={!email.trim()}>{t('Add')}</button>
          </form>
        )}
        <ul className="share-list" aria-label={t('Members')}>
          {members.map((m) => (
            <li key={m.userId}>
              <span>
                {onlineIds.has(m.userId) && <span className="online-dot" role="img" aria-label={t('Online now')} title={t('Online now')} />}
                <strong>{m.name}</strong> <span className="muted">{m.email}</span>
                {onlineIds.has(m.userId) && <span className="online-label"> · {t('here now')}</span>}
              </span>
              {m.isOriginalOwner || !owner ? (
                <span className="role-badge">{t(m.role)}</span>
              ) : (
                <span className="share-row">
                  <select aria-label={t('Role of {email}', { email: m.email })} value={m.role} onChange={(e) => void client.setMemberRole(projectId, m.userId, e.target.value as Role).then(load, (er) => setError(errText(er)))}>
                    <option value="editor">{t('editor')}</option>
                    <option value="commenter">{t('commenter')}</option>
                    <option value="viewer">{t('viewer')}</option>
                    {!isEmbedded() && <option value="owner">{t('owner')}</option>}
                  </select>
                  <button type="button" aria-label={t('Remove {email}', { email: m.email })} onClick={() => void client.removeMember(projectId, m.userId).then(load, (er) => setError(errText(er)))}><Trash2 size={14} aria-hidden /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-foot dialog-actions"><button type="button" onClick={done}>{t('Done')}</button></div>
    </div>
  );
}
export const shareDialog = (projectId: string, role: Role, file?: { id: string; name: string }) =>
  dialogs.custom<true>({ title: 'Share', className: 'share-dialog', render: (a: CustomApi<true>) => createElement(ShareForm, { projectId, fileId: file?.id, fileName: file?.name, role, done: () => a.done(true) }) });

// ---- version history -----------------------------------------------------------------------------
const CURRENT = 'current';
/** the restore flow shared by the history dialog and the timeline: confirm, restore on the server, hand the result to the editor. false = declined. Throws the API error. */
export async function restoreWithConfirm(client: Pick<Api, 'restoreVersion'>, fileId: string, version: number, restore: (saved: Saved) => void): Promise<boolean> {
  const ok = await dialogs.confirm({ title: t('Restore version {n}?', { n: version }), message: t('Your current state is kept as a new version in the history, so you can undo this.'), confirmLabel: t('Restore') });
  if (!ok) return false;
  restore(await client.restoreVersion(fileId, version));
  toast.success(t('Restored version {n}', { n: version }));
  return true;
}
export function VersionsForm({ fileId, role, currentVersion, client = api, restore, getCurrent, onTimeline, done }: {
  fileId: string;
  role: Role;
  currentVersion: number;
  client?: Pick<Api, 'listVersions' | 'restoreVersion'> & Partial<Pick<Api, 'getVersion' | 'saveNamedVersion'>>;
  /** make sure local edits are uploaded before restoring; apply the result to the editor */
  restore: (saved: Saved) => void;
  /** the document as it is in the editor right now (the "Current" side of a comparison) */
  getCurrent?: () => Project;
  /** open the version timeline instead (scrub through the versions on the canvas) */
  onTimeline?: () => void;
  done: () => void;
}) {
  const [items, setItems] = useState<VersionMeta[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>(CURRENT);
  const [diff, setDiff] = useState<DocDiff | null>(null);
  const [comparing, setComparing] = useState(false);
  const canRestore = canEdit(role);
  const reload = useCallback(async () => {
    try {
      setItems([...(await client.listVersions(fileId))].sort((a, b) => b.version - a.version));
    } catch (e) {
      setError(errText(e));
    }
  }, [client, fileId]);
  useEffect(() => {
    let live = true;
    client.listVersions(fileId).then((l) => live && setItems([...l].sort((a, b) => b.version - a.version)), (e) => live && setError(errText(e)));
    return () => {
      live = false;
    };
  }, [client, fileId]);
  const doRestore = async (v: VersionMeta) => {
    setBusy(v.version);
    setError(null);
    try {
      if (await restoreWithConfirm(client, fileId, v.version, restore)) done();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };
  const saveNamed = async () => {
    const n = name.trim();
    if (!n || !client.saveNamedVersion) return;
    setSaving(true);
    setError(null);
    try {
      const v = await client.saveNamedVersion(fileId, n);
      toast.success(t('Saved version “{name}”', { name: v.label ?? n }));
      setName('');
      await reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving(false);
    }
  };
  const docOf = async (side: string): Promise<Project> => {
    if (side === CURRENT) {
      if (!getCurrent) throw new Error(t('The current document is not available'));
      return getCurrent();
    }
    if (!client.getVersion) throw new Error(t('Comparison is not available'));
    return (await client.getVersion(fileId, Number(side))).data;
  };
  const sideLabel = (side: string) => (side === CURRENT ? t('Current') : `v${side}`);
  const compare = async (a: string, b: string) => {
    setFrom(a);
    setTo(b);
    setComparing(true);
    setError(null);
    try {
      const [da, db] = await Promise.all([docOf(a), docOf(b)]);
      setDiff(diffProjects(da, db));
    } catch (e) {
      setDiff(null);
      setError(errText(e));
    } finally {
      setComparing(false);
    }
  };
  const showOnCanvas = () => {
    if (!diff) return;
    useDiffStore.getState().show(diff, sideLabel(from), sideLabel(to));
    useSmart.getState().setDiff(true);
    done();
  };
  const options = [...(items ?? []).map((v) => ({ value: String(v.version), label: `${t('Version {n}', { n: v.version })}${v.label ? ` · ${v.label}` : ''}` })), { value: CURRENT, label: t('Current') }];
  const labelOf = (n: { id: string; data?: unknown }) => String((n.data as { label?: unknown } | undefined)?.label || n.id);
  return (
    <div className="dialog-body versions-form">
      {canRestore && client.saveNamedVersion && (
        <form className="versions-save" onSubmit={(e) => { e.preventDefault(); void saveNamed(); }}>
          <input aria-label={t('Version name')} placeholder={t('Name this version, e.g. “Before the migration”')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary" disabled={!name.trim() || saving}>{saving ? t('Saving…') : t('Save version')}</button>
        </form>
      )}
      {items === null && !error && <p className="muted">{t('Loading history…')}</p>}
      {items?.length === 0 && <p className="muted">{t('No earlier versions yet.')}</p>}
      <ul className="share-list" aria-label={t('Versions')}>
        {items?.map((v) => (
          <li key={v.version}>
            <span>
              {v.named && <span className="version-named" title={t('Named version: never deleted')} aria-label={t('Named version')}>★</span>}
              <strong>{t('Version {n}', { n: v.version })}</strong>{v.version === currentVersion && <span className="badge-inline"> {t('current')}</span>}
              {v.label ? <> · {v.label}</> : null} <span className="muted">· {formatRelative(v.createdAt)}</span>
            </span>
            <span className="version-actions">
              {client.getVersion && (
                <button type="button" disabled={comparing} aria-label={t('Compare version {n} with current', { n: v.version })} onClick={() => void compare(String(v.version), CURRENT)}>{t('Compare')}</button>
              )}
              {canRestore && v.version !== currentVersion && (
                <button type="button" disabled={busy !== null} aria-label={t('Restore version {n}', { n: v.version })} onClick={() => void doRestore(v)}>{busy === v.version ? t('Restoring…') : t('Restore')}</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {client.getVersion && (items?.length ?? 0) > 0 && (
        <div className="versions-compare" role="group" aria-label={t('Compare two versions')}>
          <label>{t('From')} <select aria-label={t('Compare from')} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">{t('Choose…')}</option>{options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
          <label>{t('To')} <select aria-label={t('Compare to')} value={to} onChange={(e) => setTo(e.target.value)}>{options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
          <button type="button" disabled={!from || comparing || from === to} onClick={() => void compare(from, to)}>{t('Compare')}</button>
        </div>
      )}
      {diff && (
        <>
          <ul className="version-diff" aria-label={t('Differences')}>
            <li><strong>{sideLabel(from)} → {sideLabel(to)}: {diffSummary(diff)}</strong></li>
            {diff.nameChanged && <li className="chg">~ {t('Renamed “{from}” → “{to}”', { from: diff.nameChanged.from, to: diff.nameChanged.to })}</li>}
            {diff.nodes.added.slice(0, 12).map((n) => <li key={`a${n.id}`} className="add">+ {labelOf(n)}</li>)}
            {diff.nodes.removed.slice(0, 12).map((n) => <li key={`r${n.id}`} className="rem">− {labelOf(n)}</li>)}
            {diff.nodes.changed.slice(0, 12).map((c) => <li key={`c${c.id}`} className="chg">~ {labelOf(c.after)}: {describeChange(c)}</li>)}
            {diff.edges.added.length + diff.edges.removed.length + diff.edges.changed.length > 0 && (
              <li className="muted">{t('Connections: {a} added, {r} removed, {c} changed', { a: diff.edges.added.length, r: diff.edges.removed.length, c: diff.edges.changed.length })}</li>
            )}
          </ul>
          {!diff.isEmpty && <button type="button" className="primary" onClick={showOnCanvas}>{t('Show on canvas')}</button>}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-foot dialog-actions">
        {onTimeline && client.getVersion && <button type="button" onClick={onTimeline}>{t('Open timeline')}</button>}
        <button type="button" onClick={done}>{t('Close')}</button>
      </div>
    </div>
  );
}

export const versionsDialog = (fileId: string, role: Role, currentVersion: number, restore: (saved: Saved) => void, getCurrent?: () => Project, onTimeline?: () => void) =>
  dialogs.custom<true>({ title: t('Version history'), className: 'share-dialog', render: (a: CustomApi<true>) => createElement(VersionsForm, { fileId, role, currentVersion, restore, getCurrent, onTimeline: onTimeline && (() => { a.done(true); onTimeline(); }), done: () => a.done(true) }) });
