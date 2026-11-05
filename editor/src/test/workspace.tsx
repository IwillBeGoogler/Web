import { act, screen } from '@testing-library/react';
import { useLayoutStore } from '../store/layoutStore';
import { createWsProject } from '../workspace/storage';

/** Seed a project (with its first file) the way the app would have after a first visit. */
export function seedProject(name: string, opts: Parameters<typeof createWsProject>[2] = {}) {
  const { project, fileId } = createWsProject(localStorage, name, opts);
  return { project, projectId: project.id, fileId };
}

/** let the route effect settle (it resolves the workspace and loads the file asynchronously) */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** the palette starts collapsed (slim icon rail): expand it */
export function openPalette(): void {
  act(() => useLayoutStore.setState({ sidebarOpen: true }));
}
export async function showComponents(): Promise<void> {
  await screen.findByTestId('palette-rail');
  openPalette();
}
