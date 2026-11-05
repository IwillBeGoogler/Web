import type { CSSProperties, ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';

export interface RowCardRow {
  id: string;
  className?: string;
  children: ReactNode;
}
export interface RowCardCompartment {
  id: string;
  className?: string;
  style?: CSSProperties;
  rows: RowCardRow[];
  /** rendered when `rows` is empty (keeps the compartment as tall as the layout reserved) */
  empty?: ReactNode;
  /** rendered inside the compartment after the rows (an add button) */
  after?: ReactNode;
  /** a collapsed compartment shows this instead of rows */
  summary?: ReactNode;
}
export interface RowCardClasses {
  root: string;
  body: string;
  row: string;
}

/**
 * Frame of a row-based node: header slot, compartments of fixed-height rows (each row may carry its own left / right
 * connection handles), and a slot below. All row heights come from the engine, so DOM and routing agree.
 */
export function RowCard({
  classes,
  style,
  testId,
  header,
  compartments,
  rowH,
  rowHandles = false,
  below,
  rootClass = '',
}: {
  classes: RowCardClasses;
  style?: CSSProperties;
  testId?: string;
  header: ReactNode;
  compartments: RowCardCompartment[];
  rowH: number;
  rowHandles?: boolean;
  below?: ReactNode;
  rootClass?: string;
}) {
  return (
    <div className={`${classes.root}${rootClass ? ` ${rootClass}` : ''}`} style={style} data-testid={testId}>
      {header}
      {compartments.map((c) => (
        <div key={c.id} className={`${classes.body}${c.className ? ` ${c.className}` : ''}`} style={c.style} data-compartment={c.id}>
          {c.summary ?? c.rows.map((r) => (
            <div key={r.id} className={`${classes.row}${r.className ? ` ${r.className}` : ''}`} style={{ height: rowH }} data-col={r.id} data-row={r.id}>
              {r.children}
              {rowHandles && (
                <>
                  <Handle id={`${r.id}-l`} type="source" position={Position.Left} className="handle er-h" />
                  <Handle id={`${r.id}-r`} type="source" position={Position.Right} className="handle er-h" />
                </>
              )}
            </div>
          ))}
          {!c.summary && c.rows.length === 0 && (c.empty ?? <div className={classes.row} style={{ height: rowH }} />)}
          {c.after}
        </div>
      ))}
      {below}
    </div>
  );
}
