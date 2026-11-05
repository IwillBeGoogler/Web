import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { errorMessage } from "@/shared/http/problem";
import { cn } from "@/shared/lib/cn";

const box =
  "group/field relative rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 pt-2 pb-1.5 transition-colors focus-within:border-fg focus-within:shadow-[2px_2px_0_0_var(--fg)] has-[[aria-invalid=true]]:border-danger has-[:disabled]:bg-surface-2 has-[:disabled]:opacity-50";
const labelCls = "block font-mono text-[10.5px] leading-4 uppercase tracking-[0.1em] text-muted group-focus-within/field:text-fg";
/** Bare control; only valid inside a `Field` box. */
export const inputCls = "h-7 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-muted";
/** Standalone boxed control for use outside `Field`. */
export const inputBoxCls =
  "h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[15px] outline-none focus:border-fg focus:shadow-[2px_2px_0_0_var(--fg)] aria-[invalid=true]:border-danger";

export type FieldA11y = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: (a: FieldA11y) => ReactNode;
}) {
  const id = useId();
  const msg = error || hint ? `${id}-m` : undefined;
  return (
    <div>
      <div className={box}>
        <label htmlFor={id} className={labelCls}>
          {label}
        </label>
        {children({ id, "aria-invalid": !!error, ...(msg ? { "aria-describedby": msg } : {}) })}
      </div>
      {error ? (
        <p id={msg} className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] text-danger">
          <span aria-hidden>!</span>
          {error}
        </p>
      ) : hint ? (
        <p id={msg} className="mt-1.5 font-mono text-[11px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordInput({ className, ...p }: ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...p} type={show ? "text" : "password"} className={cn(inputCls, "pr-16", className)} />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-0 h-7 -translate-y-1/2 rounded-[var(--radius-xs)] px-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:bg-surface-2 hover:text-fg"
      >
        <span aria-hidden>{show ? "Hide" : "Show"}</span>
      </button>
    </div>
  );
}

export const ServerError = ({ error }: { error: unknown }) =>
  error ? (
    <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-danger bg-card p-3 font-mono text-[12px] text-danger">
      <span aria-hidden>ERR</span>
      <span>{errorMessage(error)}</span>
    </p>
  ) : null;
