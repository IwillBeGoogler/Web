/** Plugin manifest (zod). A plugin is inline code or an https entry script that is fetched once and stored as inline code. */
import { z } from 'zod';

export const PERMISSIONS = ['selection:read', 'nodes:read', 'nodes:write', 'ui:panel', 'notify'] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const MAX_PLUGIN_CODE = 200_000;

const base = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(60),
  version: z.string().max(20).optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  code: z.string().max(MAX_PLUGIN_CODE).optional(),
  entry: z.string().max(2000).refine((u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } }, 'entry must be an https URL').optional(),
});
export const ManifestSchema = base.refine((m) => (m.code === undefined) !== (m.entry === undefined), 'give exactly one of code or entry');
export type PluginManifest = z.infer<typeof ManifestSchema>;
/** a plugin ready to run: id assigned, code resolved */
export interface InstalledPlugin { id: string; name: string; version: string; description?: string; permissions: Permission[]; code: string; entry?: string; enabled: boolean }

export function parseManifest(raw: unknown): { ok: true; manifest: PluginManifest } | { ok: false; error: string } {
  const r = ManifestSchema.safeParse(raw);
  return r.success ? { ok: true, manifest: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`).join('; ') };
}
