import { createContext, useContext } from 'react';

export interface AppActions {
  /** open a project (its workspace: last open file, or the first one) */
  openProject: (id: string) => void;
  /** open one file of a project */
  openFile: (projectId: string, fileId: string) => void;
  goHome: () => void;
  /** true while the editor is showing */
  inEditor: boolean;
}
export const AppContext = createContext<AppActions>({ openProject: () => undefined, openFile: () => undefined, goHome: () => undefined, inEditor: false });
export const useAppActions = () => useContext(AppContext);
