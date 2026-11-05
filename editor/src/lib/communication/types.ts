/** UML communication diagram: `object` nodes joined by `link` edges; the numbered messages live in `edge.data.uml.messages`. */
export interface CommMessage {
  id: string;
  /** dotted sequence number: `1`, `1.1`, `2` (order and nesting; kept consistent by `renumber`) */
  seq: string;
  text: string;
  /** `fwd` travels from the link's source to its target, `back` the other way */
  dir: 'fwd' | 'back';
  /** asynchronous message (open arrowhead); synchronous otherwise */
  async?: boolean;
}
