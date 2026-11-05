// Provenance of every catalog icon. Pure (no imports) so node scripts can use it too.
export type IconSourceKind =
  | 'iconify-logos' // @iconify-json/logos (gilbarbara/logos)
  | 'devicon' // @iconify-json/devicon
  | 'simple-icons' // simple-icons
  | 'cncf-landscape' // cncf/landscape hosted_logos
  | 'asf' // apache.org/logos
  | 'vendor-repo' // official project / vendor repo or press kit
  | 'dashboard-icons' // homarr-labs/dashboard-icons, selfhst/icons
  | 'cloud-pack' // vendored official AWS / GCP / Azure / K8s icon packs
  | 'parent-project' // no standalone logo: the parent project's official logo
  | 'generic' // non-brand glyph (service, queue, shapes ...)
  | 'handmade'; // drawn in-house: NEVER allowed for a branded item

export const OFFICIAL_SOURCES: readonly IconSourceKind[] = ['iconify-logos', 'devicon', 'simple-icons', 'cncf-landscape', 'asf', 'vendor-repo', 'dashboard-icons', 'cloud-pack', 'parent-project'];

export const isOfficialSource = (s: IconSourceKind): boolean => (OFFICIAL_SOURCES as readonly string[]).includes(s);

export interface IconSourceEntry {
  source: IconSourceKind;
  /** upstream key / URL / parent project name */
  origin: string;
  branded: boolean;
}

export interface SourceProblem {
  id: string;
  source: IconSourceKind | 'missing';
  problem: string;
}

/** branded items must come from an allowlisted official source; `handmade` is always flagged when branded. */
export function auditIconSources(entries: Record<string, IconSourceEntry>, ids: readonly string[]): SourceProblem[] {
  const out: SourceProblem[] = [];
  for (const id of ids) {
    const e = entries[id];
    if (!e) {
      out.push({ id, source: 'missing', problem: 'no source recorded' });
      continue;
    }
    if (!e.branded) continue;
    if (e.source === 'handmade') out.push({ id, source: e.source, problem: 'branded item uses a handmade icon' });
    else if (!isOfficialSource(e.source)) out.push({ id, source: e.source, problem: `source "${e.source}" is not an allowlisted official source` });
  }
  return out;
}
