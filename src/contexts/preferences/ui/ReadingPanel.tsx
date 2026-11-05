import { MaximizeIcon, Settings2Icon } from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { readingPrefs, useReadingPrefs } from "../application/store";
import { MEASURE_STEP, PALETTES, TYPE_STEP, TYPEFACES } from "../domain/reading";

const row = "flex h-12 items-center justify-between gap-4 px-3";
const label = "font-mono text-[11px] uppercase tracking-[0.1em] text-muted";
const select = "h-9 w-44 rounded-[var(--radius-sm)] border border-line-strong bg-card px-2 font-mono text-[12px] text-fg";
const step = "seg-item w-9 px-0 disabled:cursor-not-allowed disabled:opacity-40";

function Stepper({
  value,
  min,
  max,
  dec,
  inc,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  dec: [string, ReactNode];
  inc: [string, ReactNode];
  onChange: (v: number) => void;
}) {
  return (
    <div className="seg items-center">
      <button type="button" className={step} aria-label={dec[0]} disabled={value <= min} onClick={() => onChange(value - 1)}>
        {dec[1]}
      </button>
      <span className="idx min-w-10 text-center text-[11px]" aria-live="polite">
        {value - min + 1}/{max - min + 1}
      </span>
      <button type="button" className={step} aria-label={inc[0]} disabled={value >= max} onClick={() => onChange(value + 1)}>
        {inc[1]}
      </button>
    </div>
  );
}

function Switch({ on, onChange, name }: { on: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-7 w-14 items-center rounded-[var(--radius-xs)] border border-line-strong font-mono text-[10px] uppercase transition-colors",
        on ? "bg-inverse text-on-inverse" : "bg-surface-2 text-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 size-[22px] rounded-[2px] border border-line-strong bg-card transition-[left]",
          on ? "left-[calc(100%-24px)]" : "left-0.5",
        )}
      />
      <span aria-hidden className={cn("w-full", on ? "pl-1.5 text-left" : "pr-1.5 text-right")}>
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

const useFullscreen = () => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = (v: boolean) => {
    if (v) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen();
  };
  return [on, toggle] as const;
};

/** Theme, font, size, bold, margin, bionic, focus and full screen. */
export function ReadingControls({ footer }: { footer?: ReactNode }) {
  const p = useReadingPrefs();
  const [full, setFull] = useFullscreen();
  const set = readingPrefs.set;
  return (
    <div className="divide-y divide-line rounded-[var(--radius-sm)] border border-line">
      <div className={row}>
        <label className={label} htmlFor="palette-select">
          Theme
        </label>
        <select id="palette-select" className={select} value={p.palette} onChange={(e) => set({ palette: e.target.value })}>
          {(["light", "dark"] as const).map((mode) => (
            <optgroup key={mode} label={mode === "light" ? "Light" : "Dark"}>
              {PALETTES.filter((x) => x.mode === mode).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={row}>
        <label className={label} htmlFor="typeface-select">
          Font
        </label>
        <select id="typeface-select" className={select} value={p.typeface} onChange={(e) => set({ typeface: e.target.value })}>
          {(["Serif", "Sans", "Mono"] as const).map((g) => (
            <optgroup key={g} label={g}>
              {TYPEFACES.filter((t) => t.group === g).map((t) => (
                <option key={t.id} value={t.id} style={{ fontFamily: t.stack }}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={row}>
        <span className={label}>Size</span>
        <Stepper
          value={p.typeStep}
          min={TYPE_STEP.min}
          max={TYPE_STEP.max}
          dec={["Smaller text", "A−"]}
          inc={["Larger text", "A+"]}
          onChange={(typeStep) => set({ typeStep })}
        />
      </div>
      <div className={row}>
        <span className={label}>Margin</span>
        <Stepper
          value={p.measureStep}
          min={MEASURE_STEP.min}
          max={MEASURE_STEP.max}
          dec={["Wider margin", <span key="w" aria-hidden className="h-3 w-3 border-x-2 border-current" />]}
          inc={["Narrower margin", <span key="n" aria-hidden className="h-3 w-5 border-x-2 border-current" />]}
          onChange={(measureStep) => set({ measureStep })}
        />
      </div>
      <div className={row}>
        <span className={label}>Bold</span>
        <Switch name="Bold text" on={p.bold} onChange={(bold) => set({ bold })} />
      </div>
      <div className={row}>
        <span className={label}>Bionic</span>
        <Switch name="Bionic reading" on={p.bionic} onChange={(bionic) => set({ bionic })} />
      </div>
      <div className={row}>
        <span className={label}>Focus</span>
        <Switch name="Focus mode" on={p.focus} onChange={(focus) => set({ focus })} />
      </div>
      <div className={row}>
        <span className={label}>Full screen</span>
        <Switch name="Full screen" on={full} onChange={setFull} />
      </div>
      {footer ? <div className="flex items-center justify-between gap-2 px-1 py-1.5">{footer}</div> : null}
    </div>
  );
}

/** Curated swatch order so the grays lead. */
const SWATCH_IDS = ["galaxy", "daylight", "paper", "graphite", "slate", "ink", "carbon", "midnight", "nord", "one-dark", "gruvbox", "mocha"];
const SWATCHES = SWATCH_IDS.map((id) => PALETTES.find((x) => x.id === id)).filter((x): x is (typeof PALETTES)[number] => !!x);

/** One-tap theme swatches. */
function Swatches() {
  const p = useReadingPrefs();
  return (
    <div role="radiogroup" aria-label="Quick theme" className="grid grid-cols-6 gap-1.5 pb-3">
      {SWATCHES.map((x) => (
        <button
          key={x.id}
          type="button"
          role="radio"
          aria-checked={p.palette === x.id}
          aria-label={x.label}
          title={x.label}
          onClick={() => readingPrefs.set({ palette: x.id })}
          className={cn(
            "relative aspect-square rounded-[var(--radius-xs)] border border-line-strong",
            p.palette === x.id &&
              "outline-2 outline-fg outline-offset-2 before:absolute before:top-0 before:left-0 before:size-2 before:border-t-2 before:border-l-2 before:border-fg",
          )}
          style={{ background: x.light }}
        >
          <span className="absolute right-1 bottom-1 size-2 rounded-[2px]" style={{ background: x.secondary }} />
        </button>
      ))}
    </div>
  );
}

/** Floating settings button shown on every page. */
export function ReadingDock() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="primary"
          className="group fixed right-4 bottom-[calc(1rem+var(--cookie-h,0px))] z-40 size-12 rounded-[var(--radius-sm)] bg-inverse p-0 text-on-inverse shadow-[3px_3px_0_0_var(--line-strong)] md:right-6 md:bottom-6"
          aria-label="Reading settings"
          title="Reading settings"
        >
          <Settings2Icon className="size-5 transition-transform duration-500 group-data-[state=open]:rotate-90" aria-hidden />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={12}
          className="menu-pop z-50 max-h-[80dvh] w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[4px_4px_0_0_var(--fg)]"
        >
          <p className="tile-head">
            <MaximizeIcon className="size-3.5" aria-hidden /> Reading settings
            <kbd className="kbd ml-auto" aria-hidden>
              esc
            </kbd>
          </p>
          <div className="p-3">
            <Swatches />
            <ReadingControls
              footer={
                <>
                  <Button variant="ghost" size="sm" onClick={() => readingPrefs.reset()}>
                    Reset to defaults
                  </Button>
                  <span className="idx text-[11px]" aria-hidden>
                    prefs · local
                  </span>
                </>
              }
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
