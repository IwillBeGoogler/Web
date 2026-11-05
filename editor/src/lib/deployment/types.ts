/** UML deployment diagram. `deployment` nodes (3D boxes, artifacts, components) nested by `parentId`, joined by `edge.data.uml` of kind communication / deploy / manifest. */
export type DeploymentKind = 'node' | 'device' | 'executionEnvironment' | 'artifact' | 'component';
export const DEPLOYMENT_KINDS: DeploymentKind[] = ['node', 'device', 'executionEnvironment', 'artifact', 'component'];
export const DEPLOYMENT_LABEL: Record<DeploymentKind, string> = {
  node: 'Node', device: 'Device', executionEnvironment: 'Execution environment', artifact: 'Artifact', component: 'Component',
};
export const DEPLOYMENT_DEFAULT_NAME: Record<DeploymentKind, string> = {
  node: 'Node', device: 'Device', executionEnvironment: 'Execution environment', artifact: 'artifact.jar', component: 'Component',
};
/** elements that may hold other elements */
export const isDepContainerKind = (k: DeploymentKind): boolean => k === 'node' || k === 'device' || k === 'executionEnvironment';
export const DEPLOYMENT_ACCENT = '#3f8f6b';
export const DEPLOYMENT_LINK_KINDS = ['communication', 'deploy', 'manifest'] as const;
export type DeploymentLinkKind = (typeof DEPLOYMENT_LINK_KINDS)[number];

/** What a `deployment` node stores in `node.data`. `iconId` reuses an architecture icon. */
export interface DeploymentData {
  label: string;
  depKind: DeploymentKind;
  accent: string;
  stereotype?: string;
  iconId?: string;
  /** holds other elements (`parentId` children): keeps the size the layout gave it */
  container?: boolean;
}

export interface DepDef { id: string; name: string; kind: DeploymentKind; stereotype?: string; iconId?: string; parent?: string }
/** `label` of a communication path is the protocol; deploy / manifest carry «deploy» / «manifest» by default */
export interface DepLink { from: string; to: string; kind: DeploymentLinkKind; label?: string }
export interface DeploymentModel { nodes: DepDef[]; links: DepLink[] }
export const emptyDeploymentModel = (): DeploymentModel => ({ nodes: [], links: [] });
