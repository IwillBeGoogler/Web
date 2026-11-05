export type UseCaseKind = 'actor' | 'usecase';
/** What a `usecase` node stores in `node.data`. */
export interface UseCaseData {
  label: string;
  ucKind: UseCaseKind;
  accent: string;
  /** use cases only: named points where extending use cases may add behaviour (drawn in a compartment under the name) */
  extensionPoints?: string[];
}
export type ComponentKind = 'component' | 'node' | 'artifact' | 'provided' | 'required';
export const COMPONENT_KINDS: ComponentKind[] = ['component', 'node', 'artifact', 'provided', 'required'];
/** What a `component` node stores in `node.data`. Provided / required interfaces are small nodes (a lollipop / a socket) that connectors attach to. */
export interface ComponentData {
  label: string;
  compKind: ComponentKind;
  stereotype?: string;
  accent: string;
  /** provided / required: which way the ball / the socket's opening faces */
  facing?: 'right' | 'left' | 'up' | 'down';
  /** component / node: interfaces as ports pinned to the border (lollipop = provided, socket = required) */
  ports?: ComponentPort[];
  /** component / node that holds other components (`parentId` children): keeps the size the layout gave it */
  container?: boolean;
}
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
/** An interface on a component's border. `offset` is the position along the side (0..1, default 0.5). */
export interface ComponentPort {
  id: string;
  name: string;
  kind: 'provided' | 'required';
  side: PortSide;
  offset?: number;
}
export const UC_ACCENT = '#0f9d8f';
export const COMP_ACCENT = '#8e5bd6';
