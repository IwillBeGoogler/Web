// Registers the generated provider icon packs (AWS, GCP, Azure, Kubernetes, IBM, other clouds, CNCF):
// icon refs + lazy loaders, palette sections and the merged search index. Imported by bootstrap.
import { registerIconPack } from './icons/registry';
import { ITEMS_BY_ID, registerSections, withTags, type CatalogItem, type CatalogSection } from './catalog';
import { ID_ALIASES } from './idAliases';
import { SEARCH_INDEX, type SearchIndexData } from './search-index.generated';
import * as aws from './icons/cloud/aws.generated';
import * as gcp from './icons/cloud/gcp.generated';
import * as azure from './icons/cloud/azure.generated';
import * as k8s from './icons/cloud/k8s.generated';
import * as ibm from './icons/cloud/ibm.generated';
import * as clouds from './icons/cloud/clouds.generated';
import * as cncf from './icons/cloud/cncf.generated';

type Provider = typeof aws;
export const PROVIDERS: Provider[] = [aws, gcp, azure, k8s, ibm, clouds, cncf];

function toSection(p: Provider): CatalogSection | null {
  if (!p.DEFS.length) return null;
  const byId = new Map(p.DEFS.map((d) => [d.id, d]));
  const keep = (id: string) => !ID_ALIASES[id];
  const subs = p.SECTION.subs.map((s) => ({
    id: s.id,
    label: s.label,
    items: s.ids.filter(keep).map((id): CatalogItem => {
      const d = byId.get(id)!;
      const existing = ITEMS_BY_ID.get(id);
      if (existing && d.kind === 'icon') return { ...existing, tags: [...new Set([...existing.tags, ...d.tags])], aliases: [...new Set([...existing.aliases, ...d.aliases])] };
      if (d.kind === 'group')
        return withTags([{ id: d.id, label: d.label, kind: 'group', iconId: d.iconId, aliases: d.aliases, tags: d.tags, keywords: [], preset: d.preset ? { ...d.preset, data: { ...d.preset.data, groupIcon: d.iconId } } : undefined }])[0];
      return { id: d.id, label: d.label, kind: 'icon', iconId: d.iconId, subtitle: d.subtitle, aliases: d.aliases, tags: d.tags, keywords: [] };
    }),
  }));
  return { id: p.SECTION.id, label: p.SECTION.label, subs, count: new Set(subs.flatMap((s) => s.items.map((i) => i.id))).size };
}

let done = false;
export function registerCloudPacks(): void {
  if (done) return;
  done = true;
  for (const p of PROVIDERS) registerIconPack({ ...p.REFS, ...p.OVERRIDES }, p.LOADERS); // idempotent (icons.ts registers too)
  registerSections(PROVIDERS.map(toSection).filter((s): s is CatalogSection => !!s));
}

/** base catalog index + every provider's slice (built once; names/aliases/tags only, no SVGs) */
export function mergedSearchIndex(): SearchIndexData {
  const out: SearchIndexData = { ids: [...SEARCH_INDEX.ids], names: [...SEARCH_INDEX.names], aliases: [...SEARCH_INDEX.aliases], tags: [...SEARCH_INDEX.tags], tagIndex: {} };
  const seen = new Set(out.ids);
  for (const p of PROVIDERS)
    for (const d of p.DEFS) {
      if (ID_ALIASES[d.id]) continue;
      if (seen.has(d.id)) {
        const at = out.ids.indexOf(d.id);
        out.tags[at] = [...new Set([...out.tags[at], ...d.tags])];
        continue;
      }
      seen.add(d.id);
      out.ids.push(d.id);
      out.names.push(d.label.toLowerCase());
      out.aliases.push(d.aliases.map((a) => a.toLowerCase()));
      out.tags.push(d.tags);
    }
  out.tags.forEach((ts, i) => ts.forEach((t) => (out.tagIndex[t] ??= []).push(i)));
  return out;
}
