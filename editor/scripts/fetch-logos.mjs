// Downloads vendor logos listed in scripts/logo-manifest.json into src/assets/logos and rewrites SOURCES.md.
//   node scripts/fetch-logos.mjs
// kinds: landscape (cncf/landscape hosted_logos), asf (apache.org/logos default.png, resized), url (direct)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/assets/logos');
const manifest = JSON.parse(readFileSync(join(root, 'scripts/logo-manifest.json'), 'utf8'));
const urlFor = (m) =>
  m.kind === 'landscape' ? `https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/${encodeURIComponent(m.ref)}`
  : m.kind === 'asf' ? `https://www.apache.org/logos/res/${m.ref}/default.png`
  : m.ref;
const license = (m) =>
  m.kind === 'landscape' ? 'CNCF Landscape hosted_logos (logos belong to their owners)'
  : m.kind === 'asf' ? 'Apache Software Foundation project logo (trademark of the ASF)'
  : /dashboard-icons|selfhst/.test(m.ref) ? 'homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners)'
  : 'Official project repository';

const rows = [];
const failures = [];
const seen = new Set();
for (const m of manifest) {
  const ext = m.kind === 'asf' ? 'png' : m.kind === 'landscape' ? m.ref.split('.').pop() : m.ref.split('.').pop();
  const file = `${m.name}.${ext}`;
  if (!seen.has(file)) {
    seen.add(file);
    const target = join(dir, file);
    if (!existsSync(target)) {
      try {
        const res = await fetch(urlFor(m), { redirect: 'follow', signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (ext === 'svg' && !/<svg/i.test(buf.toString('utf8', 0, 4000))) throw new Error('not an svg');
        if (ext === 'png' && buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
        writeFileSync(target, buf);
        if (ext === 'png') execFileSync('sips', ['-Z', '192', target], { stdio: 'ignore' }); // keep embedded PNG logos small
      } catch (e) {
        failures.push(`${m.id}: ${e.message}`);
        continue;
      }
    }
  }
  rows.push(`| ${file} | ${m.id} | ${urlFor(m)} | ${license(m)} |`);
}
const head = readFileSync(join(dir, 'SOURCES.md'), 'utf8').split('\n## Fetched logos')[0].trimEnd();
writeFileSync(join(dir, 'SOURCES.md'), `${head}\n\n## Fetched logos (scripts/fetch-logos.mjs)\n\n| File | Used for | Source | License / note |\n|---|---|---|---|\n${[...new Set(rows)].join('\n')}\n`);
console.log(`ok ${rows.length}, failed ${failures.length}`);
if (failures.length) console.log(failures.join('\n'));
