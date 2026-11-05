import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import { useResolvedSettings } from '../store/settingsStore';
import { exportPage } from '../lib/exportImage';
import type { ExportSettings } from '../lib/export';

/** Export the current page; `override` lets the export menu change transparency / scale / padding for one export. */
export function useExport() {
  const { getNodes } = useReactFlow();
  const settings = useResolvedSettings();
  return useCallback(
    (kind: 'png' | 'svg', override?: Partial<ExportSettings>) => {
      const st = useDiagramStore.getState();
      const title = `${st.projectName}-${st.pages.find((p) => p.id === st.activePageId)?.name ?? 'page'}`;
      return exportPage(kind, getNodes() as never, { ...settings.export, ...override }, settings.canvas.background, title);
    },
    [getNodes, settings],
  );
}
