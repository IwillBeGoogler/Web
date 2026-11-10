import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorField } from './ColorField';

const PRESETS = ['transparent', '#ff0000', '#00ff00', '#0000ff'];

describe('ColorField', () => {
  it('shows value uppercase and opens popover with presets, picks one and closes', () => {
    const onChange = vi.fn();
    render(<ColorField label="Fill" value="#ff0000" presets={PRESETS} onChange={onChange} />);
    const trig = screen.getByRole('button', { name: 'Fill: #ff0000' });
    expect(trig).toHaveTextContent('#FF0000');
    fireEvent.click(trig);
    expect(trig).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('group', { name: 'Fill presets' });
    expect(group.querySelectorAll('.swatch')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Fill #ff0000' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Fill transparent' })).toHaveClass('none');
    fireEvent.click(screen.getByRole('button', { name: 'Fill #00ff00' }));
    expect(onChange).toHaveBeenCalledWith('#00ff00');
    expect(trig).toHaveAttribute('aria-expanded', 'false');
  });
  it('renders quick presets (excluding transparent) outside the popover', () => {
    const onChange = vi.fn();
    const { container } = render(<ColorField label="Fill" value="#00ff00" presets={PRESETS} onChange={onChange} quick={2} />);
    expect(container.querySelector('.color-field')).toHaveClass('has-quick');
    const quick = screen.getByRole('group', { name: 'Fill quick colours' });
    expect(quick.querySelectorAll('.swatch')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fill #ff0000' }));
    expect(onChange).toHaveBeenCalledWith('#ff0000');
  });
  it('mixed state hides the value and swatch activity', () => {
    const { container } = render(<ColorField label="Fill" value="#ff0000" presets={PRESETS} onChange={() => {}} mixed quick={1} />);
    const trig = screen.getByRole('button', { name: 'Fill: mixed' });
    expect(trig).toHaveTextContent('Mixed');
    expect(container.querySelector('.color-chip')).toHaveClass('mixed');
    expect(screen.getByRole('button', { name: 'Fill #ff0000' })).not.toHaveClass('active');
  });
  it('hex input commits valid values, flags invalid ones', () => {
    const onChange = vi.fn();
    render(<ColorField label="Fill" value="#ff0000" presets={PRESETS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill: #ff0000' }));
    const hex = screen.getByRole('textbox', { name: 'Fill hex' });
    expect(hex).toHaveValue('#ff0000');
    fireEvent.change(hex, { target: { value: '#12' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use a 6-digit hex like #2F6FDB')).toBeInTheDocument();
    fireEvent.change(hex, { target: { value: '#12ABef' } });
    expect(onChange).toHaveBeenCalledWith('#12ABef');
    expect(screen.queryByText('Use a 6-digit hex like #2F6FDB')).toBeNull();
    fireEvent.change(hex, { target: { value: '' } });
    expect(hex).not.toHaveAttribute('aria-invalid');
  });
  it('native colour picker emits; non-hex value falls back to black', () => {
    const onChange = vi.fn();
    render(<ColorField label="Fill" value="transparent" presets={PRESETS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill: transparent' }));
    const picker = screen.getByLabelText('Fill custom colour') as HTMLInputElement;
    expect(picker.value).toBe('#000000');
    fireEvent.change(picker, { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456');
  });
  it('toggle twice closes', () => {
    render(<ColorField label="Fill" value="#ff0000" presets={PRESETS} onChange={() => {}} />);
    const trig = screen.getByRole('button', { name: 'Fill: #ff0000' });
    fireEvent.click(trig);
    fireEvent.click(trig);
    expect(trig).toHaveAttribute('aria-expanded', 'false');
  });
});
