import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const fake = vi.hoisted(() => ({ profile: null as unknown }));
vi.mock('../clusters/profiles', async (orig) => {
  const actual = await orig<typeof import('../clusters/profiles')>();
  return { ...actual, getProfile: (id: string) => (id === 'fake' ? (fake.profile as never) : actual.getProfile(id)) };
});

import { ClusterWizard } from './ClusterWizard';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';

beforeEach(() => {
  useUiStore.getState().resetUi();
  useUiStore.getState().setWizard(null);
});

describe('ClusterWizard', () => {
  it('renders nothing without a wizard', () => {
    render(<ClusterWizard />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('creates a kafka cluster from edited fields', () => {
    const create = vi.spyOn(useDiagramStore.getState(), 'createCluster');
    useDiagramStore.setState({ createCluster: create as never });
    useUiStore.getState().setWizard({ profileId: 'kafka', at: { x: 5, y: 6 } });
    render(<ClusterWizard />);
    expect(screen.getByText('New Kafka cluster')).toBeInTheDocument();
    // number field
    fireEvent.change(screen.getByLabelText('Brokers'), { target: { value: '5' } });
    // select (string) + dependent field visibility
    expect(screen.getByLabelText('Controller quorum size')).toBeInTheDocument();
    expect(screen.queryByLabelText('ZooKeeper ensemble size')).toBeNull();
    fireEvent.change(screen.getByLabelText('Metadata mode'), { target: { value: 'zookeeper' } });
    expect(screen.queryByLabelText('Controller quorum size')).toBeNull();
    fireEvent.change(screen.getByLabelText('ZooKeeper ensemble size'), { target: { value: '5' } });
    // boolean
    expect(screen.queryByLabelText('Connect workers')).toBeNull();
    fireEvent.click(screen.getByLabelText('Kafka Connect'));
    expect(screen.getByLabelText('Connect workers')).toBeInTheDocument();
    // topics editor
    fireEvent.click(screen.getByRole('button', { name: /Add topic/ }));
    fireEvent.change(screen.getByLabelText('Topic name 2'), { target: { value: 'events' } });
    fireEvent.change(screen.getByLabelText('Topic 2 partitions'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Topic 2 replication factor'), { target: { value: '0' } });
    expect((screen.getByLabelText('Topic 2 replication factor') as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic 1' }));
    expect((screen.getByLabelText('Topic name 1') as HTMLInputElement).value).toBe('events');
    expect(screen.getByLabelText('Preview').innerHTML).toContain('svg');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(create).toHaveBeenCalledTimes(1);
    const [id, params, at] = create.mock.calls[0] as [string, Record<string, unknown>, unknown];
    expect(id).toBe('kafka');
    expect(params).toMatchObject({ mode: 'zookeeper', brokers: 5, zookeepers: 5, connect: true });
    expect(params.topics).toEqual([{ name: 'events', partitions: 8, rf: 1 }]);
    expect(at).toEqual({ x: 5, y: 6 });
    expect(useUiStore.getState().wizard).toBeNull();
    create.mockRestore();
  });

  it('shows invalid state and disables create; cancel closes', () => {
    useUiStore.getState().setWizard({ profileId: 'kafka' });
    render(<ClusterWizard />);
    fireEvent.change(screen.getByLabelText('Brokers'), { target: { value: '99' } });
    expect(screen.getByText('Invalid parameters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useUiStore.getState().wizard).toBeNull();
  });

  it('shows warnings from validate', () => {
    useUiStore.getState().setWizard({ profileId: 'kafka' });
    render(<ClusterWizard />);
    fireEvent.change(screen.getByLabelText('min.insync.replicas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Replication factor'), { target: { value: '2' } });
    const list = screen.getByRole('list', { name: 'Warnings' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('edits an existing cluster via updateCluster, using its stored params', () => {
    const update = vi.fn(() => true);
    useDiagramStore.setState({
      updateCluster: update as never,
      nodes: [{ id: 'c1', type: 'cluster', position: { x: 0, y: 0 }, data: { label: 'K', profileId: 'kafka', params: { brokers: 4 } } } as never],
    });
    useUiStore.getState().setWizard({ clusterId: 'c1' });
    render(<ClusterWizard />);
    expect(screen.getByText('Edit Kafka cluster')).toBeInTheDocument();
    expect((screen.getByLabelText('Brokers') as HTMLInputElement).value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(update).toHaveBeenCalledWith('c1', expect.objectContaining({ brokers: 4 }));
    expect(useUiStore.getState().wizard).toBeNull();
  });

  it('supports text fields and select with numeric default (fake profile)', () => {
    fake.profile = {
      id: 'fake', tech: 'Fake', label: 'Fake cluster', iconId: 'kafka', accent: '#000', roles: [], topologies: [],
      fields: [
        { key: 'name', type: 'text', label: 'Name', default: 'a' },
        { key: 'size', type: 'select', label: 'Size', default: 3, options: [{ value: 3, label: 'three' }, { value: 5, label: 'five' }] },
        { key: 'opt', type: 'topics', label: 'Opt', default: [] },
      ],
      schema: z.object({ name: z.string(), size: z.number(), opt: z.array(z.any()).optional() }),
      defaults: { name: 'a', size: 3 },
      generate: () => ({ nodes: [], edges: [], rootId: 'x', size: { width: 1, height: 1 } }),
      validate: () => [],
      summarize: (p: Record<string, unknown>) => `sum ${p.name}/${p.size}`,
    };
    useUiStore.getState().setWizard({ profileId: 'fake' });
    render(<ClusterWizard />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'zed' } });
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '5' } });
    expect(screen.getByText('sum zed/5')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Warnings' })).toBeNull();
  });
});
