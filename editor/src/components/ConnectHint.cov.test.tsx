import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectHint } from './ConnectHint';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import { blankClass } from '../lib/uml/geometry';

beforeEach(() => {
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
});

describe('ConnectHint', () => {
  it('renders nothing when not connecting', () => {
    const { container } = render(<ConnectHint />);
    expect(container).toBeEmptyDOMElement();
  });
  it('names the source node label', () => {
    act(() => useDiagramStore.getState().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'Alpha')]));
    act(() => useUiStore.setState({ connectFrom: 'c1' }));
    render(<ConnectHint />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting from Alpha');
  });
  it('falls back when node is missing', () => {
    act(() => useUiStore.setState({ connectFrom: 'ghost' }));
    render(<ConnectHint />);
    expect(screen.getByTestId('connect-hint')).toHaveTextContent('the selected node');
  });
});
