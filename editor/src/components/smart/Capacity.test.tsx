import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyText } from '../../lib/dsl/bridge';
import { setEdgeTraffic, setNodeCapacity } from '../../lib/smart/capacityBridge';
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';
import { CapacityPanel } from './CapacityPanel';

const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  useSmart.getState().reset();
  applyText('#!sdd 1\nnode lb "LB" icon=load-balancer\nnode api "API" icon=service\nnode db "DB" icon=postgresql\nlb -> api\napi -> db\n');
});

describe('capacity bridge', () => {
  it('stores inputs in data.capacity / data.traffic as one undo step each and clears them when emptied', () => {
    setNodeCapacity('api', { replicas: 3, capacityRps: 400 });
    expect(s().nodes.find((n) => n.id === 'api')!.data.capacity).toEqual({ replicas: 3, capacityRps: 400 });
    setNodeCapacity('api', { replicas: null });
    expect(s().nodes.find((n) => n.id === 'api')!.data.capacity).toEqual({ capacityRps: 400 });
    setNodeCapacity('api', { capacityRps: null });
    expect('capacity' in s().nodes.find((n) => n.id === 'api')!.data).toBe(false);
    s().undo();
    expect(s().nodes.find((n) => n.id === 'api')!.data.capacity).toEqual({ capacityRps: 400 });
    const eid = s().edges[0].id;
    setEdgeTraffic(eid, { ratio: 0.5, p99Ms: 4 });
    expect(s().edges[0].data!.traffic).toEqual({ ratio: 0.5, p99Ms: 4 });
  });
});

describe('CapacityPanel', () => {
  it('is closed by default', () => {
    render(<CapacityPanel />);
    expect(screen.queryByTestId('capacity-panel')).toBeNull();
  });
  it('edits the selected component and reports bottleneck, worst path and a labelled estimate', async () => {
    act(() => { useSmart.getState().setCapacity(true); s().selectOnly('node', 'lb'); });
    render(<CapacityPanel />);
    fireEvent.change(screen.getByLabelText('Requests in (rps)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Latency p99'), { target: { value: '10' } });
    act(() => s().selectOnly('node', 'api'));
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Capacity per replica'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Latency p99'), { target: { value: '50' } });
    act(() => s().selectOnly('node', 'db'));
    fireEvent.change(screen.getByLabelText('Latency p99'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Write share'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Payload'), { target: { value: '2' } });
    expect(s().nodes.find((n) => n.id === 'api')!.data.capacity).toEqual({ replicas: 2, capacityRps: 400, p99Ms: 50 });

    await waitFor(() => expect(screen.getByTestId('cap-worst')).toHaveTextContent('LB → API → DB'), { timeout: 3000 });
    expect(screen.getByTestId('cap-worst')).toHaveTextContent('p99 90 ms');
    expect(screen.getByText(/Bottlenecks/).nextElementSibling).toHaveTextContent(/API.*125%/); // 1000 rps on 800 capacity
    expect(screen.getByTestId('cap-storage')).toHaveTextContent(/GB \/ month/);
    expect(screen.getByTestId('cap-cost')).toHaveTextContent(/≈ \$/);
    expect(screen.getByText('rough estimate')).toBeInTheDocument();
    expect(screen.getByText(/provider list prices/)).toBeInTheDocument();
    expect(screen.getByTestId('cap-prices')).toHaveTextContent(/^Prices: AWS list, on-demand, us-east-1, as of \d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByTestId('cap-worst'));
    expect(s().nodes.filter((n) => n.selected).map((n) => n.id).sort()).toEqual(['api', 'db', 'lb']);
  });
  it('edits a call (edge) when one is selected', () => {
    act(() => { useSmart.getState().setCapacity(true); s().selectOnly('edge', s().edges[0].id); });
    render(<CapacityPanel />);
    fireEvent.change(screen.getByLabelText('Calls per request'), { target: { value: '2' } });
    expect(s().edges[0].data!.traffic).toEqual({ ratio: 2 });
  });
});
