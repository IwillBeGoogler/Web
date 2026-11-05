import type { Diagram } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { createProject } from '../project';
import { importOpenedFile, openFile } from '../../workspace/actions';
import type { ImportTarget } from '../er/apply';
import { detectSeqFormat, importSeqText } from '../seq/io';
import { sequenceNode } from '../seq/node';
import type { SequenceModel } from '../seq/types';
import { stateModelToDiagram } from '../state/convert';
import { parseStateMermaid } from '../state/mermaid';
import { isPlantUmlState, parsePlantUmlState } from '../state/plantuml';
import type { StateModel } from '../state/types';
import { looksLikeActivityMermaid, parseActivityMermaid } from '../activity/mermaid';
import { looksLikeActivityPlantuml, parseActivityPlantuml } from '../activity/plantuml';
import { activityModelToDiagram } from '../activity/convert';
import type { ActivityModel } from '../activity/types';
import { looksLikeUseCaseMermaid, parseUseCaseMermaid } from '../usecase/mermaid';
import { looksLikeUseCasePlantuml, parseUseCasePlantuml } from '../usecase/plantuml';
import { useCaseModelToDiagram } from '../usecase/convert';
import type { UseCaseModel } from '../usecase/types';
import { looksLikeComponentPlantuml, parseComponentPlantuml } from '../component/plantuml';
import { componentModelToDiagram } from '../component/convert';
import type { ComponentModel } from '../component/types';
import { looksLikeDeploymentPlantuml, parseDeploymentPlantuml } from '../deployment/plantuml';
import { deploymentModelToDiagram } from '../deployment/convert';
import type { DeploymentModel } from '../deployment/types';
import { looksLikePackagePlantuml, parsePackagePlantuml } from '../package/plantuml';
import { packageModelToDiagram } from '../package/convert';
import type { PackageModel } from '../package/types';
import { looksLikeObjectPlantuml, parseObjectPlantuml } from '../object/plantuml';
import { objectModelToDiagram } from '../object/convert';
import type { ObjectModel } from '../object/types';
import { looksLikeTimingPlantuml, parseTimingPlantuml } from '../timing/plantuml';
import { timingModelToDiagram } from '../timing/node';
import type { TimingModel } from '../timing/types';

export type DiagramKind = 'sequence' | 'state' | 'usecase' | 'activity' | 'component' | 'deployment' | 'package' | 'object' | 'timing';
export type AnyImport =
  | { kind: 'sequence'; model: SequenceModel; warnings: string[]; format: 'mermaid' | 'plantuml' }
  | { kind: 'state'; model: StateModel; warnings: string[]; format: 'mermaid' | 'plantuml' }
  | { kind: 'usecase'; model: UseCaseModel; warnings: string[]; format: 'mermaid' | 'plantuml' }
  | { kind: 'activity'; model: ActivityModel; warnings: string[]; format: 'mermaid' | 'plantuml' }
  | { kind: 'component'; model: ComponentModel; warnings: string[]; format: 'plantuml' }
  | { kind: 'deployment'; model: DeploymentModel; warnings: string[]; format: 'plantuml' }
  | { kind: 'package'; model: PackageModel; warnings: string[]; format: 'plantuml' }
  | { kind: 'object'; model: ObjectModel; warnings: string[]; format: 'plantuml' }
  | { kind: 'timing'; model: TimingModel; warnings: string[]; format: 'plantuml' };

/** Is the text a sequence or state diagram (the class importers handle everything else)? */
export function detectDiagramKind(text: string): DiagramKind | undefined {
  const t = text.trim();
  if (looksLikeTimingPlantuml(t)) return 'timing';
  if (looksLikeObjectPlantuml(t)) return 'object';
  if (looksLikePackagePlantuml(t)) return 'package';
  if (looksLikeActivityPlantuml(t) || looksLikeActivityMermaid(t)) return 'activity';
  if (/^(%%.*\n|\s)*stateDiagram(-v2)?\b/i.test(t)) return 'state';
  if (isPlantUmlState(t)) return 'state';
  if (looksLikeUseCasePlantuml(t) || looksLikeUseCaseMermaid(t)) return 'usecase';
  if (looksLikeDeploymentPlantuml(t)) return 'deployment';
  if (looksLikeComponentPlantuml(t)) return 'component';
  if (detectSeqFormat(t)) return 'sequence';
  return undefined;
}

export function importDiagramText(text: string): AnyImport | undefined {
  const k = detectDiagramKind(text);
  if (k === 'state') {
    const puml = isPlantUmlState(text);
    const r = puml ? parsePlantUmlState(text) : parseStateMermaid(text);
    return { kind: 'state', ...r, format: puml ? 'plantuml' : 'mermaid' };
  }
  if (k === 'activity') {
    const puml = /@startuml/i.test(text);
    return { kind: 'activity', ...(puml ? parseActivityPlantuml(text) : parseActivityMermaid(text)), format: puml ? 'plantuml' : 'mermaid' };
  }
  if (k === 'usecase') {
    const puml = /@startuml/i.test(text);
    return { kind: 'usecase', ...(puml ? parseUseCasePlantuml(text) : parseUseCaseMermaid(text)), format: puml ? 'plantuml' : 'mermaid' };
  }
  if (k === 'timing') return { kind: 'timing', ...parseTimingPlantuml(text), format: 'plantuml' };
  if (k === 'object') return { kind: 'object', ...parseObjectPlantuml(text), format: 'plantuml' };
  if (k === 'package') return { kind: 'package', ...parsePackagePlantuml(text), format: 'plantuml' };
  if (k === 'deployment') return { kind: 'deployment', ...parseDeploymentPlantuml(text), format: 'plantuml' };
  if (k === 'component') return { kind: 'component', ...parseComponentPlantuml(text), format: 'plantuml' };
  if (k === 'sequence') { const r = importSeqText(text)!; return { kind: 'sequence', model: r.model, warnings: r.warnings, format: r.format }; }
  return undefined;
}

export function sequenceToDiagram(model: SequenceModel, name = 'Sequence', origin = { x: 0, y: 0 }): Diagram {
  return { version: 1, nodes: [sequenceNode('seq1', origin, model, name)], edges: [] };
}

/** Put an imported sequence / state diagram into the current page, a new page or a new file. Returns the node count. */
export function applyDiagramModel(r: AnyImport, target: ImportTarget, name: string): number {
  const diagram = r.kind === 'sequence' ? sequenceToDiagram(r.model, name) : r.kind === 'usecase' ? useCaseModelToDiagram(r.model) : r.kind === 'activity' ? activityModelToDiagram(r.model) : r.kind === 'component' ? componentModelToDiagram(r.model) : r.kind === 'deployment' ? deploymentModelToDiagram(r.model) : r.kind === 'package' ? packageModelToDiagram(r.model) : r.kind === 'object' ? objectModelToDiagram(r.model) : r.kind === 'timing' ? timingModelToDiagram(r.model, name) : stateModelToDiagram(r.model);
  const st = useDiagramStore.getState();
  if (target === 'newfile') {
    const project = createProject(name);
    project.pages[0] = { ...project.pages[0], name, nodes: diagram.nodes, edges: diagram.edges };
    const res = importOpenedFile(project);
    openFile(res.fileId);
  } else st.insertContent(diagram);
  return diagram.nodes.length;
}

const FMT = { mermaid: 'Mermaid', plantuml: 'PlantUML' } as const;
/** what the import dialog shows for a non-class import: title, counts, default name and the button label */
export function describeImport(r: AnyImport): { title: string; counts: string[]; name: string; size: number; noun: string } {
  switch (r.kind) {
    case 'sequence': return { title: `Sequence diagram (${FMT[r.format]})`, counts: [`${r.model.participants.length} participants`], name: 'Imported sequence', size: r.model.participants.length, noun: 'sequence diagram' };
    case 'state': return { title: `State machine (${FMT[r.format]})`, counts: [`${r.model.states.length} states`, `${r.model.transitions.length} transitions`], name: 'Imported states', size: r.model.states.length, noun: `${r.model.states.length} states` };
    case 'usecase': return { title: `Use case diagram (${FMT[r.format]})`, counts: [`${r.model.actors.length} actors`, `${r.model.cases.length} use cases`, `${r.model.relations.length} relations`], name: 'Imported use cases', size: r.model.actors.length + r.model.cases.length, noun: 'use case diagram' };
    case 'activity': return { title: `Activity diagram (${FMT[r.format]})`, counts: [`${r.model.nodes.length} elements`, `${r.model.flows.length} flows`, `${r.model.lanes.length} swimlanes`], name: 'Imported activity', size: r.model.nodes.length, noun: 'activity diagram' };
    case 'deployment': return { title: `Deployment diagram (${FMT[r.format]})`, counts: [`${r.model.nodes.length} elements`, `${r.model.links.length} links`], name: 'Imported deployment', size: r.model.nodes.length, noun: 'deployment diagram' };
    case 'package': return { title: `Package diagram (${FMT[r.format]})`, counts: [`${r.model.packages.length} packages`, `${r.model.classes.length} classes`, `${r.model.links.length} relations`], name: 'Imported packages', size: r.model.packages.length + r.model.classes.length, noun: 'package diagram' };
    case 'object': {
      const msgs = r.model.links.reduce((n, l) => n + (l.messages?.length ?? 0), 0);
      return msgs
        ? { title: `Communication diagram (${FMT[r.format]})`, counts: [`${r.model.objects.length} objects`, `${msgs} numbered messages`], name: 'Imported communication', size: r.model.objects.length, noun: 'communication diagram' }
        : { title: `Object diagram (${FMT[r.format]})`, counts: [`${r.model.objects.length} objects`, `${r.model.links.length} links`], name: 'Imported objects', size: r.model.objects.length, noun: 'object diagram' };
    }
    case 'timing': return { title: `Timing diagram (${FMT[r.format]})`, counts: [`${r.model.lifelines.length} lifelines`, `${r.model.changes.length} state changes`, `${r.model.messages.length} messages`], name: 'Imported timing', size: r.model.lifelines.length, noun: 'timing diagram' };
    case 'component': return { title: `Component diagram (${FMT[r.format]})`, counts: [`${r.model.comps.length} components`, `${r.model.comps.reduce((n, c) => n + c.provides.length + c.requires.length, 0)} interface ports`, `${r.model.links.length} links`], name: 'Imported components', size: r.model.comps.length, noun: 'component diagram' };
  }
}
