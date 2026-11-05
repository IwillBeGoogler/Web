import { useDiagramStore } from '../../store/diagramStore';
import { createProject } from '../project';
import { importOpenedFile, openFile } from '../../workspace/actions';
import type { ImportTarget } from '../er/apply';
import { modelToDiagram } from './convert';
import type { UmlModel } from './model';

/** Put an imported class model on the canvas: into the current file (free area) or a new file. Returns the class count. */
export function applyUmlModel(model: UmlModel, target: ImportTarget, name = 'Imported classes'): number {
  const diagram = modelToDiagram(model);
  const st = useDiagramStore.getState();
  if (target === 'newfile') {
    const project = createProject(name);
    project.pages[0] = { ...project.pages[0], name, nodes: diagram.nodes, edges: diagram.edges };
    const r = importOpenedFile(project);
    openFile(r.fileId);
  } else st.insertContent(diagram);
  return diagram.nodes.filter((n) => n.type === 'class').length;
}
