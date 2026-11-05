import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import type { DiagramNode } from '../../types';
import { applyUmlModel } from './apply';
import { computeDrift } from './drift';
import { useDriftStore } from './driftStore';
import { classOf } from './geometry';
import { importUmlText, type UmlFormat } from './io';
import { modelIdOf } from './shared';

const s = () => useDiagramStore.getState();

/** per language: the first version of the code, and the second one (Account renamed to Customer, Ledger gains an attribute, deposit changes a parameter type) */
const CODE: Record<string, { fmt: UmlFormat; v1: string; v2: (v1: string) => string }> = {
  typescript: {
    fmt: 'typescript',
    v1: 'export class Account { id: string; balance: number; deposit(n: number): void {} close(): void {} }\nexport class Ledger { entries: string[]; }\n',
    v2: (v) => v.replace(/Account/g, 'Customer').replace('entries: string[];', 'entries: string[]; owner: string;').replace('n: number', 'n: string'),
  },
  java: {
    fmt: 'java',
    v1: 'public class Account {\n  private String id;\n  private int balance;\n  public void deposit(int n) { }\n  public void close() { }\n}\nclass Ledger {\n  private String entries;\n}\n',
    v2: (v) => v.replace(/Account/g, 'Customer').replace('private String entries;', 'private String entries;\n  private String owner;').replace('int n', 'long n'),
  },
  python: {
    fmt: 'python',
    v1: 'class Account:\n    id: str\n    balance: int\n    def deposit(self, n: int) -> None: ...\n    def close(self) -> None: ...\n\nclass Ledger:\n    entries: str\n',
    v2: (v) => v.replace(/Account/g, 'Customer').replace('    entries: str', '    entries: str\n    owner: str').replace('n: int', 'n: str'),
  },
  go: {
    fmt: 'go',
    v1: 'package shop\n\ntype Account struct {\n\tID string\n\tBalance int\n}\n\nfunc (a *Account) Deposit(n int) {}\nfunc (a *Account) Close() {}\n\ntype Ledger struct {\n\tEntries string\n}\n',
    v2: (v) => v.replace(/Account/g, 'Customer').replace('\tEntries string', '\tEntries string\n\tOwner string').replace('n int', 'n int64'),
  },
  csharp: {
    fmt: 'csharp',
    v1: 'public class Account {\n  public string Id { get; set; }\n  public int Balance { get; set; }\n  public void Deposit(int n) { }\n  public void Close() { }\n}\npublic class Ledger {\n  public string Entries { get; set; }\n}\n',
    v2: (v) => v.replace(/Account/g, 'Customer').replace('public string Entries { get; set; }', 'public string Entries { get; set; }\n  public string Owner { get; set; }').replace('int n', 'long n'),
  },
};

beforeEach(() => {
  s().reset();
  useDriftStore.getState().clear();
});

describe.each(Object.entries(CODE))('code re-import keeps the diagram (%s)', (_name, { fmt, v1, v2 }) => {
  it('a renamed class and a changed class: ids, positions, member ids, modelId and archRef survive; accepting leaves no drift', async () => {
    const m1 = (await importUmlText(v1, fmt)).model;
    expect(m1.classes.map((c) => c.name)).toEqual(['Account', 'Ledger']);
    applyUmlModel(m1, 'page');
    // the user arranged it, cross-linked it and shared it with another page
    s().nodes.forEach((n, i) => s().setNodePosition(n.id, { x: 120 + i * 410, y: 60 + i * 90 }));
    const acc = s().nodes.find((n) => classOf(n).label === 'Account')!;
    s().updateNodeData(acc.id, { archRef: { nodeId: 'svc-accounts' } } as never);
    const firstPage = s().activePageId;
    s().addPage('Second');
    const copyId = s().addLinkedClass({ pageId: firstPage, nodeId: acc.id })!;
    s().switchPage(firstPage);
    const before = s().nodes.filter((n) => n.type === 'class').map((n) => ({ id: n.id, pos: { ...n.position }, label: classOf(n).label, memberIds: [...classOf(n).attributes, ...classOf(n).operations].map((m) => m.id) }));
    const modelId = modelIdOf(s().nodes.find((n) => n.id === acc.id)!);
    expect(modelId).toBeTruthy();

    const m2 = (await importUmlText(v2(v1), fmt)).model;
    expect(m2.classes.map((c) => c.name)).toEqual(['Customer', 'Ledger']);
    const drift = computeDrift(s().nodes, s().edges, m2, { removed: true });
    // a rename, not "Customer added" + "Account removed"
    expect(drift.classes.some((c) => c.status === 'added' || c.status === 'removed')).toBe(false);
    const cust = drift.classes.find((c) => c.name === 'Customer')!;
    expect(cust.nodeId).toBe(acc.id);
    expect(cust.header.name).toEqual(['Account', 'Customer']);
    expect(drift.classes.find((c) => c.name === 'Ledger')!.members.some((m) => m.name.toLowerCase() === 'owner' && m.status === 'added')).toBe(true);

    useDriftStore.getState().start(m2, 'code', { removed: true });
    useDriftStore.getState().acceptAll();
    expect(computeDrift(s().nodes, s().edges, m2, { removed: true }).isEmpty).toBe(true);
    useDriftStore.getState().clear();

    // identity kept
    expect(s().nodes.filter((n) => n.type === 'class')).toHaveLength(before.length);
    for (const b of before) {
      const n = s().nodes.find((x) => x.id === b.id)!;
      expect(n.position).toEqual(b.pos);
      const ids = [...classOf(n).attributes, ...classOf(n).operations].map((m) => m.id);
      for (const id of b.memberIds) expect(ids).toContain(id);
    }
    const renamed = s().nodes.find((n) => n.id === acc.id) as DiagramNode;
    expect(classOf(renamed).label).toBe('Customer');
    expect(modelIdOf(renamed)).toBe(modelId);
    expect(renamed.data.archRef).toEqual({ nodeId: 'svc-accounts' });
    // the linked copy on the other page follows the rename and the member changes
    s().switchPage(s().pages[1].id);
    const copy = s().nodes.find((n) => n.id === copyId)!;
    expect(classOf(copy).label).toBe('Customer');
    expect(classOf(copy).operations.map((o) => o.name)).toEqual(classOf(renamed).operations.map((o) => o.name));
  });

  it('a class that really is new or really is gone is not mistaken for a rename', async () => {
    applyUmlModel((await importUmlText(v1, fmt)).model, 'page');
    const m2 = (await importUmlText(v1.replace(/Ledger/g, 'Totally').replace(/entries|Entries/g, 'zzz'), fmt)).model;
    const d = computeDrift(s().nodes, s().edges, m2, { removed: true });
    expect(d.classes.find((c) => c.name === 'Totally')!.status).toBe('added');
    expect(d.classes.find((c) => c.name === 'Ledger')!.status).toBe('removed');
  });
});
