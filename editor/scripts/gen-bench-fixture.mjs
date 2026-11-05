// Writes the 5k / 10k node benchmark projects (.sdd) used by e2e/perf.spec.ts into e2e/fixtures/:  npm run bench:fixture
// Runs the TypeScript sources through Vite's SSR loader so the `@core` alias and the app modules resolve exactly like in the build.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const { BENCH_SIZES, makeBenchProject } = await vite.ssrLoadModule('/src/lib/bench/fixture.ts');
  const { buildSddProj } = await vite.ssrLoadModule('/src/lib/sdd/sddproj.ts');
  mkdirSync('e2e/fixtures', { recursive: true });
  for (const n of BENCH_SIZES) {
    const doc = makeBenchProject(n);
    const bytes = buildSddProj({ name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt, folders: [], files: [{ id: `fil_bench_${n}`, folderId: null, name: doc.name, kind: 'sdd', position: 0, doc }] });
    const file = `e2e/fixtures/bench-${n / 1000}k.sdd`;
    writeFileSync(file, bytes);
    console.log(`${file}  ${doc.pages[0].nodes.length} nodes, ${doc.pages[0].edges.length} edges, ${(bytes.length / 1024).toFixed(0)} kB`);
  }
} finally {
  await vite.close();
}
