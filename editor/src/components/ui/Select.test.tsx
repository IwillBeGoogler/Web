import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

const OPTS = [{ value: '', label: 'Default' }, { value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
function Harness() {
  const [v, setV] = useState('');
  return <Select label="Pick" value={v} options={OPTS} onChange={setV} />;
}

describe('Select', () => {
  it('is a labelled combobox that opens a listbox and picks with the keyboard', () => {
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Pick' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveTextContent('Alpha');
  });
  it('closes on Escape without changing the value and picks by click', () => {
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Pick' });
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveTextContent('Default');
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    expect(box).toHaveTextContent('Beta');
  });
});
