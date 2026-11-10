import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ButtonGrid, Chip, Field, InspectorHeader, Seg, Slider, SubHead, ToolButton } from './Inspector';
import { useFieldId } from './fieldContext';

function Inner() {
  return <input id={useFieldId()} />;
}

describe('Inspector primitives', () => {
  it('Field ties label to child control, shows value, mixed tag and hint', () => {
    const { container } = render(<Field label="Name" value="v" mixed hint="help" inline><Inner /></Field>);
    expect(screen.getByLabelText(/Name/)).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText('v')).toHaveClass('prop-value');
    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(screen.getByText('help')).toHaveClass('prop-hint');
    expect(container.firstChild).toHaveClass('inline');
    expect(container.firstChild).toHaveAttribute('data-mixed', 'true');
  });
  it('Field error wins over hint and is an alert; nothing when neither', () => {
    const { rerender, container } = render(<Field label="N" error="Bad" hint="help"><Inner /></Field>);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad');
    expect(screen.queryByText('help')).toBeNull();
    rerender(<Field label="N"><Inner /></Field>);
    expect(container.querySelector('.prop-hint')).toBeNull();
    expect(container.querySelector('.prop-value')).toBeNull();
    expect(container.querySelector('.mixed-tag')).toBeNull();
    rerender(<Field label="N" hint="only hint"><Inner /></Field>);
    expect(screen.getByText('only hint')).not.toHaveClass('error');
  });
  it('Slider shows value+unit, fills pct and emits numbers', () => {
    const onChange = vi.fn();
    render(<Slider label="Opacity" value={50} min={0} max={200} unit="%" onChange={onChange} ariaLabel="Opacity slider" />);
    const r = screen.getByRole('slider', { name: 'Opacity slider' }) as HTMLInputElement;
    expect(r).toHaveAttribute('aria-valuetext', '50%');
    expect(r.style.getPropertyValue('--pct')).toBe('25%');
    expect(screen.getByText('50%')).toBeInTheDocument();
    fireEvent.change(r, { target: { value: '80' } });
    expect(onChange).toHaveBeenCalledWith(80);
  });
  it('Slider degenerate range gives 0 pct and label fallback', () => {
    render(<Slider label="X" value={5} min={5} max={5} onChange={() => {}} />);
    const r = screen.getByRole('slider', { name: 'X' }) as HTMLInputElement;
    expect(r.style.getPropertyValue('--pct')).toBe('0%');
  });
  it('Seg marks pressed option and emits; mixed presses none', () => {
    const onChange = vi.fn();
    const opts = [['a', 'Alpha'], ['b', 'Beta']] as const;
    const { rerender } = render(<Seg value="a" options={opts} onChange={onChange} label="Mode" />);
    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
    rerender(<Seg value="a" options={opts} onChange={onChange} label="Mode" mixed />);
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('Chip tone and title; SubHead; ButtonGrid cols', () => {
    const { rerender, container } = render(<Chip>3</Chip>);
    expect(screen.getByText('3')).toHaveAttribute('class', 'chip');
    rerender(<Chip tone="warn" title="t">3</Chip>);
    expect(screen.getByText('3')).toHaveClass('chip-warn');
    expect(screen.getByText('3')).toHaveAttribute('title', 't');
    rerender(<SubHead>Sub</SubHead>);
    expect(screen.getByText('Sub')).toHaveClass('prop-subhead');
    rerender(<ButtonGrid label="Align" cols={3}><button>x</button></ButtonGrid>);
    expect((container.firstChild as HTMLElement).style.gridTemplateColumns).toContain('repeat(3');
    rerender(<ButtonGrid label="Align"><button>x</button></ButtonGrid>);
    expect((container.firstChild as HTMLElement).style.gridTemplateColumns).toBe('');
  });
  it('ToolButton labels, pressed/danger classes, forwards click', () => {
    const onClick = vi.fn();
    render(<ToolButton label="Undo" pressed danger onClick={onClick}>U</ToolButton>);
    const b = screen.getByRole('button', { name: 'Undo' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b).toHaveClass('on', 'danger-tool');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalled();
  });
  it('InspectorHeader renders toolbar only when tools or primary exist', () => {
    const { rerender } = render(<InspectorHeader tile="T" title={<h3>Title</h3>} kind="Node" meta={<span>meta</span>} />);
    expect(screen.getByTestId('inspector-header')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).toBeNull();
    rerender(<InspectorHeader tile="T" title="x" kind="Node" primary={<button>P</button>} />);
    expect(screen.getByRole('toolbar', { name: 'Node actions' })).toContainElement(screen.getByText('P'));
    rerender(<InspectorHeader tile="T" title="x" kind="Node" tools={<button>Q</button>} />);
    expect(screen.getByRole('toolbar')).toContainElement(screen.getByText('Q'));
  });
});
