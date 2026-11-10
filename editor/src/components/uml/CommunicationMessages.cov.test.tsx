import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommunicationMessages } from './CommunicationMessages';
import { useDiagramStore } from '../../store/diagramStore';
import { blankClass } from '../../lib/uml/geometry';
import { umlEdge } from '../../lib/uml/edges';
import { messagesOf } from '../../lib/communication/messages';

const s = () => useDiagramStore.getState();
const edge = () => s().edges.find((e) => e.id === 'e')!;
const msgs = () => messagesOf(edge());
function setup() {
  s().reset();
  act(() => {
    s().addNode(blankClass('a', { x: 0, y: 0 }, 'class', 'Alpha'));
    s().addNode(blankClass('b', { x: 300, y: 0 }, 'class', 'Beta'));
    useDiagramStore.setState({ edges: [umlEdge('e', 'a', 'b', { kind: 'link' })] });
  });
}

describe('CommunicationMessages', () => {
  beforeEach(setup);
  it('empty state, add, renumber', () => {
    render(<CommunicationMessages edge={edge()} />);
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add message' }));
    expect(msgs()).toHaveLength(1);
    expect(msgs()[0].seq).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Renumber all' }));
    expect(msgs()).toHaveLength(1);
  });
  it('edits, flips, async, reorders, nests and removes', () => {
    const { rerender } = render(<CommunicationMessages edge={edge()} />);
    const redo = () => rerender(<CommunicationMessages edge={edge()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add message' })); redo();
    fireEvent.click(screen.getByRole('button', { name: 'Add message' })); redo();
    expect(msgs().map((m) => m.seq)).toEqual(['1', '2']);
    const input = screen.getByLabelText('Message 1 text');
    fireEvent.change(input, { target: { value: ' login() ' } });
    fireEvent.blur(input); redo();
    expect(msgs()[0].text).toBe('login()');
    // direction label uses node names; flip toggles both ways
    expect(screen.getAllByRole('button', { name: 'Flip direction' })[0]).toHaveTextContent('Alpha → Beta');
    fireEvent.click(screen.getAllByRole('button', { name: 'Flip direction' })[0]); redo();
    expect(msgs()[0].dir).toBe('back');
    expect(screen.getAllByRole('button', { name: 'Flip direction' })[0]).toHaveTextContent('Beta → Alpha');
    fireEvent.click(screen.getAllByRole('button', { name: 'Flip direction' })[0]); redo();
    expect(msgs()[0].dir).toBe('fwd');
    fireEvent.click(screen.getByLabelText('Asynchronous message 1')); redo();
    expect(msgs()[0].async).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]); redo();
    expect(msgs()[1].text).toBe('login()');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]); redo();
    expect(msgs()[0].text).toBe('login()');
    fireEvent.click(screen.getAllByRole('button', { name: /Nest under/ })[1]); redo();
    expect(msgs().map((m) => m.seq)).toEqual(['1', '1.1']);
    fireEvent.click(screen.getAllByRole('button', { name: /Move out one level/ })[1]); redo();
    expect(msgs().map((m) => m.seq)).toEqual(['1', '2']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove message' })[0]); redo();
    expect(msgs()).toHaveLength(1);
  });
  it('falls back to node ids when nodes are missing', () => {
    act(() => useDiagramStore.setState({ nodes: [] }));
    render(<CommunicationMessages edge={edge()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add message' }));
    expect(msgs()).toHaveLength(1);
  });
});
