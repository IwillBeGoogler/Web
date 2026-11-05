/** Sample plugins. They only use the public `sdd` API inside the sandbox; `run(args)` is called by the host. */
import type { PluginManifest } from './manifest';

export const SAMPLE_PLUGINS: (PluginManifest & { code: string })[] = [
  {
    name: 'Rename selection',
    version: '1.0.0',
    description: 'Numbers the selected nodes: "Item 1", "Item 2" ...',
    permissions: ['selection:read', 'nodes:write', 'notify'],
    code: `async function run(args) {
  var prefix = (args && args.prefix) || 'Item';
  var sel = await sdd.getSelection();
  if (!sel.length) { await sdd.notify({ message: 'Select some nodes first', kind: 'info' }); return; }
  await sdd.updateNodes({ updates: sel.map(function (n, i) { return { id: n.id, data: { label: prefix + ' ' + (i + 1) } }; }) });
  await sdd.notify({ message: 'Renamed ' + sel.length + ' nodes', kind: 'success' });
}`,
  },
  {
    name: 'Generate grid of icons',
    version: '1.0.0',
    description: 'Creates a rows x columns grid of icon nodes.',
    permissions: ['nodes:write', 'notify'],
    code: `async function run(args) {
  var rows = Math.min(20, (args && args.rows) || 3), cols = Math.min(20, (args && args.cols) || 4);
  var nodes = [];
  for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) nodes.push({ type: 'icon', x: c * 160, y: r * 140, data: { label: 'Icon ' + (r * cols + c + 1) } });
  await sdd.createNodes({ nodes: nodes });
  await sdd.notify({ message: 'Created ' + nodes.length + ' icons', kind: 'success' });
}`,
  },
  {
    name: 'Export as Markdown table',
    version: '1.0.0',
    description: 'Lists every node (name, type, subtitle) as a Markdown table.',
    permissions: ['nodes:read', 'notify'],
    code: `async function run() {
  var nodes = await sdd.getNodes();
  var rows = ['| Name | Type | Subtitle |', '| --- | --- | --- |'];
  nodes.forEach(function (n) { rows.push('| ' + String(n.data.label || '').replace(/\\|/g, '\\\\|') + ' | ' + n.type + ' | ' + String(n.data.subtitle || '').replace(/\\|/g, '\\\\|') + ' |'); });
  await sdd.notify({ message: nodes.length + ' nodes exported', kind: 'success' });
  return rows.join('\\n');
}`,
  },
];
