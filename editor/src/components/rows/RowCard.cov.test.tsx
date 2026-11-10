import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { RowCard } from './RowCard';

const classes = { root: 'r', body: 'b', row: 'w' };
const mount = (props: Partial<React.ComponentProps<typeof RowCard>>) =>
  render(<ReactFlowProvider><RowCard classes={classes} header={<h4>H</h4>} rowH={18} compartments={[]} {...props} /></ReactFlowProvider>).container;

describe('RowCard', () => {
  it('renders header, rows with height and data attrs, handles, after and below', () => {
    const c = mount({
      rootClass: 'sel', testId: 't', style: { width: 5 }, rowHandles: true, below: <i className="bl" />,
      compartments: [{ id: 'k', className: 'x', rows: [{ id: 'a', className: 'pk', children: 'A' }, { id: 'b', children: 'B' }], after: <u className="af" /> }],
    });
    const root = c.querySelector('[data-testid=t]')!;
    expect(root.className).toBe('r sel');
    expect(root.querySelector('h4')).not.toBeNull();
    expect(root.querySelector('[data-compartment=k]')!.className).toBe('b x');
    const rows = root.querySelectorAll('[data-row]');
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).style.height).toBe('18px');
    expect(rows[0].className).toBe('w pk');
    expect(rows[0].getAttribute('data-col')).toBe('a');
    expect(root.querySelectorAll('.handle.er-h')).toHaveLength(4);
    expect(root.querySelector('.af')).not.toBeNull();
    expect(root.querySelector('.bl')).not.toBeNull();
  });
  it('without handles, plain root class', () => {
    const c = mount({ compartments: [{ id: 'k', rows: [{ id: 'a', children: 'A' }] }] });
    expect(c.querySelector('.handle')).toBeNull();
    expect(c.firstElementChild!.className).toBe('r');
  });
  it('empty compartment: placeholder row or custom empty', () => {
    const c = mount({ compartments: [{ id: 'e1', rows: [] }, { id: 'e2', rows: [], empty: <em>none</em> }] });
    const e1 = c.querySelector('[data-compartment=e1] .w') as HTMLElement;
    expect(e1.style.height).toBe('18px');
    expect(c.querySelector('[data-compartment=e2] em')!.textContent).toBe('none');
    expect(c.querySelector('[data-compartment=e2] .w')).toBeNull();
  });
  it('summary replaces rows and suppresses empty', () => {
    const c = mount({ compartments: [{ id: 's', rows: [{ id: 'a', children: 'A' }], summary: <span>3 hidden</span> }, { id: 's2', rows: [], summary: <span>sum</span> }] });
    expect(c.querySelector('[data-compartment=s]')!.textContent).toBe('3 hidden');
    expect(c.querySelector('[data-compartment=s2] .w')).toBeNull();
  });
});
