import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pageToContent, pageToProject } from '../../lib/smart/infraProject';
import { importInfra } from '@core/infra';
import { InfraImportForm, previewInfra } from './InfraImport';

const fx = (n: string) => readFileSync(join(process.cwd(), 'src/components/smart/fixtures/infra', n), 'utf8');

describe('infra import dialog', () => {
  it('previews pasted Kubernetes YAML and hands the files to the caller', () => {
    const done = vi.fn();
    render(<InfraImportForm done={done} cancel={() => undefined} />);
    expect(screen.getByRole('button', { name: /Insert as new file/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Infrastructure text'), { target: { value: fx('k8s.yaml') } });
    expect(screen.getByRole('status')).toHaveTextContent('Kubernetes YAML');
    expect(screen.getByRole('status')).toHaveTextContent(/\d+ resources/);
    expect(screen.getByTestId('infra-preview').querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Insert as new file/ }));
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ target: 'newfile', files: [expect.objectContaining({ text: expect.stringContaining('kind: Deployment') })] }));
  });
  it('shows a readable error for garbage and keeps the button disabled', () => {
    render(<InfraImportForm done={() => undefined} cancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Infrastructure text'), { target: { value: 'just some words' } });
    expect(screen.getByRole('status')).toHaveTextContent(/not recognised/);
    expect(screen.getByRole('button', { name: /Insert as new file/ })).toBeDisabled();
  });
  it('lets you switch to "this file"', async () => {
    const done = vi.fn();
    render(<InfraImportForm done={done} cancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Infrastructure text'), { target: { value: fx('compose.yml') } });
    fireEvent.click(screen.getByLabelText('This file (free area)'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ target: 'page' }));
  });
  it('previewInfra is silent for empty input', () => {
    expect(previewInfra([{ name: 'x', text: '  ' }])).toEqual({ ok: false, error: '' });
  });
});

describe('page -> editor content', () => {
  it('styles edges, orders parents first and makes a one-page project', () => {
    const { page } = importInfra([{ name: 'main.tf', text: fx('main.tf') }]);
    const c = pageToContent(page);
    expect(c.edges.every((e) => !!e.style)).toBe(true);
    const idx = new Map(c.nodes.map((n, i) => [n.id, i]));
    for (const n of c.nodes) if (n.parentId) expect(idx.get(n.parentId)!).toBeLessThan(idx.get(n.id)!);
    const p = pageToProject(page, 'Infra');
    expect(p.name).toBe('Infra');
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0].nodes.length).toBe(page.nodes.length);
  });
});
