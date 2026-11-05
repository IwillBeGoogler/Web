import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { applyUmlModel } from '../../lib/uml/apply';
import { importUmlText } from '../../lib/uml/io';
import { useDriftStore } from '../../lib/uml/driftStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { DriftPanel } from './DriftPanel';

const s = () => useDiagramStore.getState();
const V1 = 'export class User { name: string; age: number; }\nexport class Audit { who: string; }\n';
const V2 = 'export class User { name: string; age: string; email: string; }\nexport class Session { token: string; }\n';
const model = async (c: string) => (await importUmlText(c, 'typescript')).model;

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useDriftStore.getState().clear();
  useUiStore.getState().resetUi();
});

describe('Code sync panel', () => {
  it('lists the differences; accept applies the code, reject keeps the diagram', async () => {
    applyUmlModel(await model(V1), 'page');
    act(() => { void model(V2).then((m) => useDriftStore.getState().start(m, 'user.ts', { removed: true })); });
    await waitFor(() => expect(useDriftStore.getState().drift).not.toBeNull());
    render(<DriftPanel />);
    expect(screen.getByTestId('drift-panel')).toHaveTextContent('user.ts');
    expect(screen.getByText(/new in code/)).toBeInTheDocument(); // Session
    expect(screen.getByText(/not in code/)).toBeInTheDocument(); // Audit
    fireEvent.click(screen.getByLabelText('Accept added member email of User'));
    const user = () => s().nodes.find((n) => n.data.label === 'User')!.data as unknown as { attributes: { name: string; type?: string }[] };
    expect(user().attributes.map((a) => a.name)).toEqual(['name', 'age', 'email']);
    fireEvent.click(screen.getByLabelText('Reject changed member age of User'));
    expect(user().attributes.find((a) => a.name === 'age')!.type).toBe('number'); // kept
    expect(screen.queryByLabelText('Accept changed member age of User')).toBeNull();
    fireEvent.click(screen.getByLabelText('Accept added class Session'));
    expect(s().nodes.some((n) => n.data.label === 'Session')).toBe(true);
    fireEvent.click(screen.getByLabelText('Reject removed class Audit'));
    expect(s().nodes.some((n) => n.data.label === 'Audit')).toBe(true);
    await waitFor(() => expect(screen.getByText('The diagram matches the code.')).toBeInTheDocument());
  });
  it('accept all / reject all', async () => {
    applyUmlModel(await model(V1), 'page');
    act(() => { void model(V2).then((m) => useDriftStore.getState().start(m, 'user.ts', { removed: false })); });
    await waitFor(() => expect(useDriftStore.getState().drift).not.toBeNull());
    render(<DriftPanel />);
    fireEvent.click(screen.getByText('Accept all'));
    const labels = s().nodes.map((n) => n.data.label).sort();
    expect(labels).toEqual(['Audit', 'Session', 'User']); // Audit stays: removed classes were not requested
    await waitFor(() => expect(screen.getByText('The diagram matches the code.')).toBeInTheDocument());
  });
  it('is not shown when there is no comparison', () => {
    render(<DriftPanel />);
    expect(screen.queryByTestId('drift-panel')).toBeNull();
  });
});

describe('markers on the class nodes', () => {
  it('rows are flagged, added members appear as ghost rows, the header shows how many differences', async () => {
    const p = seedProject('Drift');
    s().reset();
    render(<App initialProjectId={p.projectId} />);
    const m1 = await model(V1);
    act(() => { applyUmlModel(m1, 'page'); });
    const m2 = await model(V2);
    act(() => useDriftStore.getState().start(m2, 'user.ts', { removed: false }));
    const user = s().nodes.find((n) => n.data.label === 'User')!;
    await waitFor(() => expect(screen.getByTestId(`drift-chip-${user.id}`)).toHaveTextContent('2 in code'));
    expect(screen.getByTestId(`drift-ghosts-${user.id}`)).toHaveTextContent('+ email: string');
    const ageRow = screen.getByTestId(`class-${user.id}`).querySelector('.uml-row.drift-changed');
    expect(ageRow).toBeTruthy();
    expect(ageRow!.textContent).toContain('age');
    act(() => useDriftStore.getState().clear());
    await waitFor(() => expect(screen.queryByTestId(`drift-chip-${user.id}`)).toBeNull());
  });
});
