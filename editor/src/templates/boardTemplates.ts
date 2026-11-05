import type { Diagram, DiagramEdge, DiagramNode } from '../types';
import { createFrame } from '../lib/board/frames';
import { STICKY_SIZE, createSticky } from '../lib/board/sticky';
import { styleEdge } from '../lib/graph';
import type { Template } from './index';

/** tiny DSL for board templates: frames (presentation order = creation order), stickies, headings, shapes, edges */
function board() {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  let order = 0;
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const api = {
    nodes, edges,
    frame(x: number, y: number, w: number, h: number, label: string, accent?: string): string {
      const f = createFrame(id('fr'), { x, y, width: w, height: h }, label);
      f.data = { ...f.data, order: order++, ...(accent ? { accent } : {}) };
      nodes.push(f);
      return f.id;
    },
    sticky(x: number, y: number, color: string, text = '', w = STICKY_SIZE.width, h = STICKY_SIZE.height): void {
      const s = createSticky(id('st'), { x: 0, y: 0 }, { color, label: text });
      nodes.push({ ...s, position: { x, y }, width: w, height: h });
    },
    /** a grid of empty stickies, `cols` x `rows`, inside a frame at (x, y) with its header height 56 */
    grid(x: number, y: number, cols: number, rows: number, color: string, texts: string[] = []): void {
      const gap = 20;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) api.sticky(x + 20 + c * (STICKY_SIZE.width + gap), y + 20 + r * (STICKY_SIZE.height + gap), color, texts[r * cols + c] ?? '');
    },
    text(x: number, y: number, label: string, fontSize = 16, bold = false): void {
      nodes.push({ id: id('tx'), type: 'text', position: { x, y }, data: { label, fontSize, ...(bold ? { bold: true } : {}) } });
    },
    box(key: string, x: number, y: number, w: number, h: number, label: string, fill: string, text = '#ffffff'): string {
      nodes.push({ id: key, type: 'shape', position: { x, y }, width: w, height: h, data: { label, shape: 'rounded', fill, stroke: fill, strokeWidth: 1.5, radius: 8, textColor: text, fontSize: 13, bold: false } });
      return key;
    },
    link(source: string, target: string, label: string, dashed = false): void {
      edges.push(styleEdge({ id: id('e'), source, target, label, data: { ...(dashed ? { dashed: true } : {}), arrows: 'end' } } as DiagramEdge));
    },
    done: (): Diagram => ({ version: 1, nodes, edges }),
  };
  return api;
}

const COLW = 3 * STICKY_SIZE.width + 2 * 20 + 40; // frame width for three sticky columns
const ROWH = 2 * STICKY_SIZE.height + 20 + 40;

function retro(): Diagram {
  const b = board();
  const cols: [string, string, string, string][] = [['Start', 'green', 'What should we begin doing?', 'A 10-minute demo every Friday'], ['Stop', 'red', 'What is slowing us down?', 'Meetings without an agenda'], ['Continue', 'blue', 'What is working well?', 'Pairing on tricky bugs']];
  cols.forEach(([label, color, hint, example], i) => {
    const x = i * (COLW + 40);
    b.frame(x, 0, COLW, ROWH + 40, label);
    b.text(x + 20, 14, hint, 14);
    b.grid(x, 24, 3, 2, color, [example]);
  });
  return b.done();
}

function brainstorm(): Diagram {
  const b = board();
  b.frame(0, 0, 640, 360, 'Problem');
  b.text(24, 24, 'How might we …?', 26, true);
  b.sticky(24, 90, 'yellow', 'Describe the problem in one sentence', 220, 120);
  b.frame(700, 0, COLW + 100, ROWH + 80, 'Ideas');
  b.grid(700 + 40, 40, 3, 2, 'yellow');
  b.frame(0, ROWH + 140, COLW + 100, 360, 'Group the ideas');
  b.text(24, ROWH + 164, 'Select similar stickies and use "Group by color" or "Arrange as grid"', 14);
  b.frame(COLW + 160, ROWH + 140, 640, 360, 'Next steps');
  b.grid(COLW + 160 + 20, ROWH + 200, 2, 1, 'green', ['Pick the top idea', 'Assign an owner']);
  return b.done();
}

function journey(): Diagram {
  const b = board();
  const phases = ['Awareness', 'Consideration', 'Purchase', 'Onboarding', 'Retention'];
  const lanes: [string, string][] = [['Doing', 'yellow'], ['Thinking', 'blue'], ['Feeling', 'pink'], ['Pain points', 'red'], ['Opportunities', 'green']];
  const w = STICKY_SIZE.width + 40;
  const laneH = STICKY_SIZE.height + 40;
  phases.forEach((p, i) => b.frame(150 + i * (w + 16), 0, w, 56 + lanes.length * laneH, p));
  lanes.forEach(([lane, color], r) => {
    b.text(10, 56 + r * laneH + laneH / 2 - 10, lane, 15, true);
    phases.forEach((_, i) => b.sticky(150 + i * (w + 16) + 20, 56 + r * laneH + 20, color, ''));
  });
  return b.done();
}

function c4(): Diagram {
  const b = board();
  const person = '#08427b';
  const system = '#1168bd';
  const ext = '#8a8f98';
  const cont = '#438dd5';
  b.frame(0, 0, 900, 560, 'C4 level 1: System context');
  const u = b.box('c4_user', 340, 60, 220, 90, 'Customer\n[Person]\nBuys things online', person);
  const s = b.box('c4_shop', 340, 240, 220, 110, 'Web Shop\n[Software system]\nSells products', system);
  const pay = b.box('c4_pay', 40, 420, 220, 90, 'Payment provider\n[External system]', ext);
  const mail = b.box('c4_mail', 640, 420, 220, 90, 'E-mail service\n[External system]', ext);
  b.link(u, s, 'Browses and orders using');
  b.link(s, pay, 'Charges cards using');
  b.link(s, mail, 'Sends e-mail using');
  b.frame(1000, 0, 1100, 640, 'C4 level 2: Containers');
  const web = b.box('c4_web', 1380, 40, 220, 90, 'Web app\n[React SPA]\nShop UI', cont);
  const api = b.box('c4_api', 1380, 230, 220, 90, 'API\n[Node.js]\nBusiness logic', cont);
  const db = b.box('c4_db', 1060, 430, 220, 90, 'Database\n[PostgreSQL]\nOrders, catalogue', cont);
  const q = b.box('c4_q', 1380, 430, 220, 90, 'Queue\n[RabbitMQ]\nAsync jobs', cont);
  const worker = b.box('c4_worker', 1740, 430, 220, 90, 'Worker\n[Node.js]\nSends e-mail', cont);
  const user2 = b.box('c4_user2', 1740, 40, 200, 80, 'Customer\n[Person]', person);
  b.link(user2, web, 'Uses [HTTPS]');
  b.link(web, api, 'Calls [JSON/HTTPS]');
  b.link(api, db, 'Reads and writes [SQL]');
  b.link(api, q, 'Publishes jobs [AMQP]');
  b.link(q, worker, 'Delivers jobs [AMQP]');
  const mail2 = b.box('c4_mail2', 1740, 250, 220, 90, 'E-mail service\n[External system]', ext);
  b.link(worker, mail2, 'Sends e-mail [SMTP]', true);
  return b.done();
}

function stride(): Diagram {
  const b = board();
  const cats: [string, string, string][] = [
    ['Spoofing: pretending to be someone else', 'red', 'Authentication'],
    ['Tampering: changing data or code', 'orange', 'Integrity'],
    ['Repudiation: denying an action', 'yellow', 'Non-repudiation'],
    ['Information disclosure: leaking data', 'purple', 'Confidentiality'],
    ['Denial of service: making it unavailable', 'blue', 'Availability'],
    ['Elevation of privilege: gaining rights', 'teal', 'Authorization'],
  ];
  const w = 2 * STICKY_SIZE.width + 60;
  const h = STICKY_SIZE.height + 120;
  b.frame(0, 0, 3 * w + 40, 300, 'System under review');
  b.text(24, 24, 'Draw or paste the data flow diagram here: processes, data stores, external actors, trust boundaries.', 14);
  cats.forEach(([label, color, prop], i) => {
    const x = (i % 3) * (w + 20);
    const y = 340 + Math.floor(i / 3) * (h + 20);
    b.frame(x, y, w, h, label);
    b.text(x + 20, y + 14, `Violates: ${prop}`, 13);
    b.sticky(x + 20, y + 50, color, '');
    b.sticky(x + 20 + STICKY_SIZE.width + 20, y + 50, color, '');
  });
  return b.done();
}

function postmortem(): Diagram {
  const b = board();
  b.frame(0, 0, 760, 300, 'Summary');
  b.text(24, 24, 'What happened, who was affected and for how long?', 14);
  b.sticky(24, 70, 'yellow', 'Impact', 220, 130);
  b.sticky(264, 70, 'orange', 'Duration', 220, 130);
  b.sticky(504, 70, 'pink', 'Detection', 220, 130);
  b.frame(800, 0, 1000, 300, 'Timeline');
  ['Start', 'Detected', 'Mitigated', 'Resolved'].forEach((t, i) => b.sticky(824 + i * 230, 70, 'blue', t, 210, 130));
  b.frame(0, 340, 760, 340, 'Root cause (5 whys)');
  b.grid(20, 340 + 44, 2, 1, 'purple', ['Why 1', 'Why 2']);
  b.frame(800, 340, 480, 340, 'What went well');
  b.grid(820, 340 + 44, 2, 1, 'green');
  b.frame(1320, 340, 480, 340, 'What went wrong');
  b.grid(1340, 340 + 44, 2, 1, 'red');
  b.frame(0, 720, 1800, 280, 'Action items');
  b.grid(24, 720 + 44, 5, 1, 'teal', ['Owner + due date', '', '', '', '']);
  return b.done();
}

function kanban(): Diagram {
  const b = board();
  const w = STICKY_SIZE.width + 60;
  const h = 4 * (STICKY_SIZE.height + 20) + 80;
  [['To do', 'yellow', ['Write the spec', 'Design review']], ['Doing', 'blue', ['Implement the feature']], ['Done', 'green', ['Kick-off']]].forEach(([label, color, items], i) => {
    const x = i * (w + 30);
    b.frame(x, 0, w, h, label as string);
    (items as string[]).forEach((t, k) => b.sticky(x + 30, 60 + k * (STICKY_SIZE.height + 20), color as string, t));
  });
  return b.done();
}

export const TEMPLATES: Template[] = [
  { id: 'board-retro', name: 'Board: Retro (Start / Stop / Continue)', description: 'Three columns for a team retrospective, one frame each so you can present them.', tags: ['board', 'retro', 'retrospective', 'agile', 'workshop'], build: retro },
  { id: 'board-brainstorm', name: 'Board: Brainstorm', description: 'Problem, ideas, grouping and next steps.', tags: ['board', 'brainstorm', 'ideas', 'workshop'], build: brainstorm },
  { id: 'board-journey', name: 'Board: User journey map', description: 'Phases across, lanes for doing, thinking, feeling, pain points and opportunities.', tags: ['board', 'journey', 'ux', 'workshop'], build: journey },
  { id: 'board-c4', name: 'Board: C4 model (context + container)', description: 'A system context and a container diagram, each in its own frame.', tags: ['board', 'c4', 'architecture', 'context', 'container'], build: c4 },
  { id: 'board-stride', name: 'Board: Threat model (STRIDE)', description: 'A frame for the system and one per STRIDE category.', tags: ['board', 'security', 'threat', 'stride'], build: stride },
  { id: 'board-postmortem', name: 'Board: Incident postmortem', description: 'Summary, timeline, root cause, what went well and wrong, action items.', tags: ['board', 'incident', 'postmortem', 'sre'], build: postmortem },
  { id: 'board-kanban', name: 'Board: Kanban', description: 'To do, Doing, Done.', tags: ['board', 'kanban', 'agile', 'tasks'], build: kanban },
];
