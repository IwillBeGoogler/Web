import type { Diagram, DiagramEdge, DiagramNode, PortSide } from '../types';
import { styleEdge } from '../lib/graph';
import type { Template } from './index';

// chalk on a blackboard: every colour reads on the near-black canvas (>= 4.5:1 for text, >= 3:1 for lines)
const PAPER = '#101114';
const INK = '#ece9e1';
const MUTED = '#a6a398';
const CHALK = '#cfcbbf';
const MAIN = '#6fcf8e'; // main path
const ACK = '#8ab4f8'; // ACK / response
const ASYNC = '#f2b84b'; // async / queued
const FAIL = '#ef7070'; // failure / retry

type Flow = 'main' | 'ack' | 'async' | 'fail';
const FLOW: Record<Flow, { color: string; strokeStyle: 'solid' | 'dotted' | 'dashed' }> = {
  main: { color: MAIN, strokeStyle: 'solid' },
  ack: { color: ACK, strokeStyle: 'dotted' },
  async: { color: ASYNC, strokeStyle: 'dashed' },
  fail: { color: FAIL, strokeStyle: 'solid' },
};

/**
 * "System design board": a blank, annotated whiteboard for explaining how a system works. Placeholders and prompts only (no product, no copied text).
 * Dashed sections A-G + feature deep dives + observability (with failure drills) + a row of design challenges; every section carries a short
 * hand-written note. Amber dashed boxes are async / warning notes, red dashed boxes are failure notes. Four coloured flow kinds.
 * Dark canvas with the sketch look. Every edge is pinned to sides and runs on a shared centre line, so the routes are straight runs.
 */
export function systemDesignBoard(): Diagram {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  let seq = 0;

  const group = (id: string, label: string, x: number, y: number, w: number, h: number, parentId?: string, variant: 'dashed' | 'card' = 'dashed', o: { stroke?: string; color?: string; fill?: string } = {}) =>
    nodes.push({
      id, type: 'group', position: { x, y }, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}),
      data: {
        label, variant, stroke: o.stroke ?? (variant === 'dashed' ? MUTED : CHALK), strokeStyle: variant === 'dashed' ? 'dashed' : 'solid', strokeWidth: 1.6, textColor: o.color ?? INK, fontSize: variant === 'dashed' ? 20 : 18,
        ...(o.fill ? { fill: o.fill, fillOpacity: 9 } : {}),
      },
    });
  const box = (id: string, label: string, x: number, y: number, parentId: string, o: { w?: number; h?: number; shape?: 'rounded' | 'diamond' | 'cylinder' | 'ellipse'; stroke?: string; bold?: boolean } = {}) =>
    nodes.push({
      id, type: 'shape', position: { x, y }, width: o.w ?? 140, height: o.h ?? 56, parentId,
      data: { label, shape: o.shape ?? 'rounded', stroke: o.stroke ?? CHALK, strokeWidth: 1.8, border: true, radius: 12, textColor: INK, fontSize: 16, bold: !!o.bold },
    });
  const text = (id: string, label: string, x: number, y: number, w: number, h: number, o: { size?: number; color?: string; bold?: boolean; align?: 'left' | 'center'; parentId?: string } = {}) =>
    nodes.push({ id, type: 'text', position: { x, y }, width: w, height: h, ...(o.parentId ? { parentId: o.parentId } : {}), data: { label, fontSize: o.size ?? 16, textColor: o.color ?? INK, ...(o.bold ? { bold: true } : {}), ...(o.align ? { align: o.align } : {}) } });
  /** a hand-written note: plain text, or (async / fail) text inside an amber / red dashed box with an optional bold title */
  const note = (id: string, label: string, x: number, y: number, w: number, h: number, parentId: string, kind: 'plain' | 'async' | 'fail' = 'plain', title = '') => {
    if (kind === 'plain') return text(id, label, x, y, w, h, { size: 17, color: MUTED, parentId });
    const c = kind === 'async' ? ASYNC : FAIL;
    group(id, title, x, y, w, h, parentId, 'dashed', { stroke: c, color: c });
    text(`${id}-t`, label, 12, title ? 42 : 10, w - 24, h - (title ? 50 : 20), { size: 17, color: c, parentId: id });
  };
  const flow = (kind: Flow, source: string, target: string, pins: [PortSide, PortSide], label?: string) => {
    const f = FLOW[kind];
    edges.push(
      styleEdge({
        id: `e${++seq}`, source, target, ...(label ? { label } : {}),
        data: { color: f.color, strokeStyle: f.strokeStyle, strokeWidth: 2.2, arrows: 'end', labelBg: false, labelColor: f.color, pinSource: pins[0], pinTarget: pins[1], flowKind: kind },
      }),
    );
  };

  // ---- header: title, subtitle, legend ----
  text('title', '<System name> system design', 0, -210, 1180, 56, { size: 40, bold: true });
  text('subtitle', '<one line: how one request travels through the system>', 0, -140, 1180, 34, { size: 22, color: MUTED });
  group('legend', 'Legend', 1280, -230, 620, 150);
  text('lg-main', '───▶  Main path', 24, 54, 280, 30, { color: MAIN, parentId: 'legend' });
  text('lg-ack', '·····▶  ACK / response', 24, 94, 280, 30, { color: ACK, parentId: 'legend' });
  text('lg-async', '- - -▶  Async / queued', 316, 54, 280, 30, { color: ASYNC, parentId: 'legend' });
  text('lg-fail', '───✕  Failure / retry', 316, 94, 280, 30, { color: FAIL, parentId: 'legend' });

  // ---- row 1: A..C, E, F (children share centre lines y = 98 / 188 / 278 so the flows are straight; a note sits under them) ----
  const ROW = 450;
  group('a', 'A  Clients', 0, 0, 280, ROW);
  box('a1', 'Client 1', 70, 70, 'a');
  box('a2', 'Client 2', 70, 160, 'a');
  box('a3', 'Client 3', 70, 250, 'a');
  note('a-n', '✎ Who calls the system? List each client type, how it connects and what it does when the connection drops.', 20, 330, 240, 100, 'a');

  group('b', 'B  Edge & connection', 360, 0, 320, ROW);
  box('b-lb', 'Load balancer', 90, 70, 'b');
  box('b-gw', 'API gateway', 90, 160, 'b');
  box('b-dns', 'DNS', 90, 250, 'b');
  note('b-n', '✎ Why persistent connections? What does the edge check (identity, limits) before a request moves on?', 20, 330, 280, 100, 'b');

  group('c', 'C  Core services', 760, 0, 320, ROW);
  box('c1', 'Service 1', 90, 70, 'c');
  box('c2', 'Service 2', 90, 160, 'c');
  box('c3', 'Service 3', 90, 250, 'c');
  note('c-n', '✎ One job per service. Where does state live, and which parts must stay stateless?', 20, 330, 280, 100, 'c');

  group('e', 'E  Storage & queues', 1160, 0, 380, ROW);
  box('e-q', 'Queue', 30, 70, 'e', { stroke: ASYNC });
  box('e-cache', 'Cache', 30, 160, 'e');
  box('e-obj', 'Object store', 30, 250, 'e');
  box('e-db', 'Database', 200, 143, 'e', { w: 150, h: 90, shape: 'cylinder' });
  note('e-n', 'Async hop: what if the queue backs up, or the same message arrives twice?', 20, 326, 340, 108, 'e', 'async');

  group('f', 'F  Consumers', 1620, 0, 280, ROW);
  box('f1', 'Consumer 1', 70, 70, 'f');
  box('f2', 'Consumer 2', 70, 160, 'f');
  box('f3', 'Consumer 3', 70, 250, 'f');
  note('f-n', '✎ Who reads the results? What if a consumer is slow, down or sees an event twice?', 20, 330, 240, 100, 'f');

  flow('main', 'a1', 'b-lb', ['right', 'left']);
  flow('main', 'b-lb', 'b-gw', ['bottom', 'top']);
  flow('main', 'b-gw', 'c2', ['right', 'left']);
  flow('ack', 'b-gw', 'a2', ['left', 'right']);
  flow('async', 'c1', 'e-q', ['right', 'left']);
  flow('async', 'e-q', 'f1', ['right', 'left']);
  flow('main', 'c2', 'e-cache', ['right', 'left']);
  flow('main', 'e-cache', 'e-db', ['right', 'left']);
  flow('main', 'e-db', 'f2', ['right', 'left']);
  flow('fail', 'c3', 'e-obj', ['right', 'left']);

  // ---- row 2: D main flow (left) + the whole lifecycle, in order (right) ----
  const DY = 510;
  group('d', 'D  Main flow', 0, DY, 1900, 480);
  const steps: [string, string, number][] = [
    ['d1', '1  Receive request', 40],
    ['d2', '2  Validate', 252],
    ['d4', '4  Process', 696],
    ['d5', '5  Persist', 908],
    ['d6', '6  Respond', 1120],
  ];
  for (const [id, label, x] of steps) box(id, label, x, 188, 'd', { w: 150, h: 64, bold: true });
  box('d3', '3  Valid?', 464, 165, 'd', { w: 170, h: 110, shape: 'diamond', stroke: ASYNC, bold: true });
  box('d-fb', 'Fallback / retry', 464, 350, 'd', { w: 170, h: 56, stroke: FAIL });
  text('d1-n', '✎ <what arrives: headers, payload>', 40, 262, 150, 66, { size: 16, color: MUTED, parentId: 'd' });
  text('d2-n', '✎ <checks: identity, schema>', 252, 262, 150, 66, { size: 16, color: MUTED, parentId: 'd' });
  text('d4-n', '✎ <business logic: what is atomic?>', 696, 262, 150, 66, { size: 16, color: MUTED, parentId: 'd' });
  text('d5-n', '✎ <write path: which store, in what order?>', 908, 262, 150, 66, { size: 16, color: MUTED, parentId: 'd' });
  text('d6-n', '✎ <what the caller sees>', 1120, 118, 150, 56, { size: 16, color: MUTED, parentId: 'd' });
  group('d-fork', 'The fork everyone asks about', 430, 30, 400, 116, 'd', 'dashed', { stroke: ASYNC, color: ASYNC, fill: ASYNC });
  text('d-fork-t', 'What exactly happens when this check fails: retry, queue or reject?', 12, 44, 376, 62, { size: 17, color: ASYNC, parentId: 'd-fork' });
  note('d-fail', 'When validation fails, what does the caller get back, and can it safely retry?', 40, 346, 380, 110, 'd', 'fail', 'Failure note');
  group('d-life', 'Whole lifecycle, in order', 1330, 36, 540, 420, 'd', 'card');
  text(
    'd-life-t',
    ['1  <client connects>', '2  <edge accepts and checks identity>', '3  <request is validated>', '4  <core service handles it>', '5  <state is written, ACK returned>', '6  <work is queued for later>', '7  <consumers pick it up>', '8  <result is confirmed back>', '9  <failures retried or parked>', '10  <metrics, logs, traces record it>'].join('\n'),
    20, 50, 500, 350, { size: 19, color: INK, parentId: 'd-life' },
  );
  flow('main', 'd1', 'd2', ['right', 'left']);
  flow('main', 'd2', 'd3', ['right', 'left']);
  flow('main', 'd3', 'd4', ['right', 'left'], 'yes');
  flow('main', 'd4', 'd5', ['right', 'left']);
  flow('main', 'd5', 'd6', ['right', 'left']);
  flow('fail', 'd3', 'd-fb', ['bottom', 'top'], 'no');
  flow('async', 'd-fb', 'd6', ['right', 'bottom'], 'retry later');

  // ---- row 3: G state model ----
  const GY = 1050;
  group('g', 'G  Status semantics', 0, GY, 1900, 320);
  const states: [string, string, string][] = [
    ['g1', 'pending', '✎ <true when: request stored, nothing done yet>'],
    ['g2', 'accepted', '✎ <true when: a service took responsibility>'],
    ['g3', 'processed', '✎ <true when: the work ran, result not yet seen>'],
    ['g4', 'confirmed', '✎ <true when: the other side acknowledged>'],
  ];
  states.forEach(([id, label, n], i) => {
    box(id, label, 40 + i * 260, 70, 'g', { w: 170, h: 64, bold: true, stroke: i === 3 ? MAIN : CHALK });
    text(`${id}-n`, n, 30 + i * 260, 148, 190, 80, { size: 16, color: MUTED, align: 'center', parentId: 'g' });
  });
  for (let i = 1; i < 4; i++) flow('main', `g${i}`, `g${i + 1}`, ['right', 'left']);
  note('g-n', '✎ One sentence per status: what is true, who sets it, and which event moves it to the next one. Can a status ever go backwards?', 40, 244, 1000, 56, 'g');
  note('g-bug', 'The classic bug: a status that says "confirmed" when the work was only accepted. Name the exact event for each step, and who may skip one.', 1100, 60, 760, 110, 'g', 'fail', 'Classic bug');
  note('g-async', 'The step to "processed" happens off the request path. How does the caller learn that it changed: poll, push or callback?', 1100, 190, 760, 110, 'g', 'async', 'Async note');

  // ---- row 4: feature deep dives, each with a note area and a side box (trade-off, async note or failure note) ----
  const FY = 1430;
  for (let i = 0; i < 4; i++) {
    const g = `ft${i + 1}`;
    group(g, `Feature ${i + 1}  <name>`, i * 490, FY, 430, 480);
    box(`${g}-a`, 'Step A', 25, 80, g, { w: 100 });
    box(`${g}-b`, 'Step B', 165, 80, g, { w: 100 });
    box(`${g}-c`, 'Step C', 305, 80, g, { w: 100 });
    flow('main', `${g}-a`, `${g}-b`, ['right', 'left']);
    flow('main', `${g}-b`, `${g}-c`, ['right', 'left']);
    text(`${g}-q`, '<key question this feature must answer>', 25, 150, 380, 50, { size: 17, color: MUTED, parentId: g });
    text(`${g}-notes`, '✎ Notes: <what to explain, which numbers>', 25, 208, 380, 56, { size: 17, color: CHALK, parentId: g });
    if (i < 2) {
      // trade-off: Option A vs Option B with plus / minus lines
      for (const [k, x] of [['a', 12], ['b', 238]] as const) {
        group(`${g}-opt-${k}`, `Option ${k.toUpperCase()}`, x, 280, 180, 178, g, 'card');
        text(`${g}-opt-${k}-p`, '+ <upside>\n+ <upside>', 12, 42, 156, 56, { size: 17, color: MAIN, parentId: `${g}-opt-${k}` });
        text(`${g}-opt-${k}-m`, '− <downside>\n− <downside>', 12, 104, 156, 56, { size: 17, color: FAIL, parentId: `${g}-opt-${k}` });
      }
      text(`${g}-vs`, 'vs', 194, 355, 42, 30, { size: 20, bold: true, align: 'center', parentId: g });
    } else if (i === 2) {
      note(`${g}-side`, 'What runs later, off the request path? How is it retried, and when does someone get told it is late?', 12, 280, 406, 178, g, 'async', 'Async note');
    } else {
      note(`${g}-side`, 'What breaks first here? What does the user see, and what is the fastest safe way back?', 12, 280, 406, 178, g, 'fail', 'Failure note');
    }
  }

  // ---- row 5: observability & reliability, with failure drills ----
  const LY = 1970;
  group('l', 'L  Observability & reliability', 0, LY, 1900, 360);
  [
    ['Metrics', '<rate, errors, latency>'],
    ['Logs', '<what is kept, for how long?>'],
    ['Traces', '<one id across every hop>'],
    ['Alerts', '<who is paged, for what?>'],
    ['Rate limits', '<per client, per route>'],
    ['Retries & DLQ', '<backoff, cap, where it parks>'],
  ].forEach(([label, hint], i) => {
    box(`l${i + 1}`, label, 40 + i * 303, 60, 'l', { w: 220, h: 56 });
    text(`l${i + 1}-n`, `✎ ${hint}`, 40 + i * 303, 122, 220, 56, { size: 16, color: MUTED, align: 'center', parentId: 'l' });
  });
  [
    ['Drill 1  Dependency down', 'A dependency stops answering. What do callers see, which alert fires, and how do you recover?'],
    ['Drill 2  Retries pile up', 'Everything retries at once. Is there backoff and a cap? Where do exhausted messages go?'],
    ['Drill 3  Overload', 'Traffic is far above the plan. What is shed first, and how does the system say so to callers?'],
  ].forEach(([title, body], i) => note(`l-drill${i + 1}`, body, 40 + i * 620, 200, 580, 140, 'l', 'fail', title));

  // ---- row 6: system design challenges ----
  const CY = 2390;
  group('ch', 'System design challenges', 0, CY, 1900, 330);
  [
    ['Scale', 'What breaks first at 10x traffic?'],
    ['Latency', 'Where does the time go, and what is the budget?'],
    ['Availability', 'What happens when one zone is gone?'],
    ['Consistency', 'Which reads may be stale, and for how long?'],
    ['Failure handling', 'What is retried, what is dropped, what is replayed?'],
    ['Cost', 'What is the cost per request and what dominates it?'],
  ].forEach(([title, prompt], i) => {
    const id = `ch${i + 1}`;
    group(id, `${i + 1}  ${title}`, 40 + i * 307, 60, 285, 190, 'ch', 'card');
    text(`${id}-q`, prompt, 16, 56, 253, 110, { size: 17, color: MUTED, parentId: id });
  });
  note('ch-n', '✎ Pick two of these and answer them out loud, with numbers. That is the part people remember.', 40, 266, 1100, 44, 'ch');

  return {
    version: 1,
    nodes,
    edges,
    settings: {
      canvas: { background: PAPER, grid: false, sketch: true },
      edge: { color: CHALK, width: 2.2, labelBackground: false },
      group: { borderColor: MUTED, borderStyle: 'dashed' },
    },
  };
}

export const TEMPLATES: Template[] = [
  {
    id: 'system-design-board',
    name: 'System design board',
    description: 'Annotated whiteboard for explaining a system: sections with hand-written prompts, one main flow with its whole lifecycle, status semantics, feature deep dives with trade-offs, observability with failure drills and design challenges. Dark, sketch look.',
    tags: ['board', 'system-design', 'whiteboard', 'sketch', 'blank'],
    build: systemDesignBoard,
  },
];
