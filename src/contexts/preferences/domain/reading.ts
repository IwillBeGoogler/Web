/**
 * Reading preferences, ported from principal-swe-knowledge-graph's reading
 * panel: palette, typeface, text size, margin (line length), bold text,
 * bionic reading, focus mode and full screen. Pure data and rules only.
 */

const GF = "https://fonts.googleapis.com/css2?family=";

export interface Typeface {
  id: string;
  label: string;
  group: "Serif" | "Sans" | "Mono";
  stack: string;
  /** Google Fonts stylesheet, fetched on demand when chosen. */
  href?: string;
}

export const TYPEFACES: Typeface[] = [
  { id: "source-serif", label: "Source Serif", group: "Serif", stack: '"Source Serif 4", Georgia, serif' },
  {
    id: "newsreader",
    label: "Newsreader",
    group: "Serif",
    stack: '"Newsreader", Georgia, serif',
    href: `${GF}Newsreader:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  { id: "literata", label: "Literata", group: "Serif", stack: '"Literata", Georgia, serif', href: `${GF}Literata:ital,wght@0,400;0,600;1,400&display=swap` },
  { id: "lora", label: "Lora", group: "Serif", stack: '"Lora", Georgia, serif', href: `${GF}Lora:ital,wght@0,400;0,600;1,400&display=swap` },
  {
    id: "merriweather",
    label: "Merriweather",
    group: "Serif",
    stack: '"Merriweather", Georgia, serif',
    href: `${GF}Merriweather:ital,wght@0,400;0,700;1,400&display=swap`,
  },
  {
    id: "libre-baskerville",
    label: "Libre Baskerville",
    group: "Serif",
    stack: '"Libre Baskerville", Georgia, serif',
    href: `${GF}Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap`,
  },
  {
    id: "eb-garamond",
    label: "EB Garamond",
    group: "Serif",
    stack: '"EB Garamond", Georgia, serif',
    href: `${GF}EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  {
    id: "crimson-pro",
    label: "Crimson Pro",
    group: "Serif",
    stack: '"Crimson Pro", Georgia, serif',
    href: `${GF}Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  { id: "spectral", label: "Spectral", group: "Serif", stack: '"Spectral", Georgia, serif', href: `${GF}Spectral:ital,wght@0,400;0,600;1,400&display=swap` },
  { id: "inter", label: "Inter", group: "Sans", stack: '"Inter", system-ui, sans-serif' },
  { id: "system-sans", label: "System Sans", group: "Sans", stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  {
    id: "work-sans",
    label: "Work Sans",
    group: "Sans",
    stack: '"Work Sans", system-ui, sans-serif',
    href: `${GF}Work+Sans:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  {
    id: "public-sans",
    label: "Public Sans",
    group: "Sans",
    stack: '"Public Sans", system-ui, sans-serif',
    href: `${GF}Public+Sans:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    group: "Sans",
    stack: '"IBM Plex Sans", system-ui, sans-serif',
    href: `${GF}IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  {
    id: "source-sans",
    label: "Source Sans 3",
    group: "Sans",
    stack: '"Source Sans 3", system-ui, sans-serif',
    href: `${GF}Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  {
    id: "nunito-sans",
    label: "Nunito Sans",
    group: "Sans",
    stack: '"Nunito Sans", system-ui, sans-serif',
    href: `${GF}Nunito+Sans:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  { id: "manrope", label: "Manrope", group: "Sans", stack: '"Manrope", system-ui, sans-serif', href: `${GF}Manrope:wght@400;600&display=swap` },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    group: "Mono",
    stack: '"JetBrains Mono", ui-monospace, monospace',
    href: `${GF}JetBrains+Mono:wght@400;600&display=swap`,
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    group: "Mono",
    stack: '"IBM Plex Mono", ui-monospace, monospace',
    href: `${GF}IBM+Plex+Mono:ital,wght@0,400;0,600;1,400&display=swap`,
  },
  {
    id: "intel-one-mono",
    label: "Intel One Mono",
    group: "Mono",
    stack: '"Intel One Mono", ui-monospace, monospace',
    href: `${GF}Intel+One+Mono:ital,wght@0,400;0,600;1,400&display=swap`,
  },
];

/** Quartz palette tokens: light = page, dark = ink, secondary = accent. */
export interface Palette {
  id: string;
  label: string;
  mode: "light" | "dark";
  light: string;
  lightgray: string;
  gray: string;
  dark: string;
  secondary: string;
}

export const PALETTES: Palette[] = [
  { id: "galaxy", label: "Galaxy", mode: "dark", light: "#010208", lightgray: "#1f2346", gray: "#a6abd6", dark: "#eceeff", secondary: "#9aa6ff" },
  { id: "daylight", label: "Daylight", mode: "light", light: "#eef1ff", lightgray: "#d5dbf5", gray: "#454d7a", dark: "#0b1030", secondary: "#4b55d6" },
  { id: "paper", label: "Paper", mode: "light", light: "#f5f5f5", lightgray: "#d4d4d4", gray: "#525252", dark: "#0a0a0a", secondary: "#171717" },
  { id: "sepia", label: "Sepia", mode: "light", light: "#f4ecd8", lightgray: "#ded0b0", gray: "#6e624c", dark: "#1f1a12", secondary: "#96601c" },
  { id: "solarized", label: "Solarized", mode: "light", light: "#fdf6e3", lightgray: "#e6dcc3", gray: "#5f6b6b", dark: "#073642", secondary: "#8a6800" },
  { id: "slate", label: "Slate", mode: "light", light: "#f7f8fa", lightgray: "#e2e5ea", gray: "#5f6672", dark: "#14171c", secondary: "#2f6f5e" },
  { id: "cream", label: "Cream", mode: "light", light: "#fbf7ef", lightgray: "#e8e0d2", gray: "#6b6255", dark: "#1b1811", secondary: "#8a5a2b" },
  { id: "linen", label: "Linen", mode: "light", light: "#f6f4f0", lightgray: "#e3e0d9", gray: "#67645e", dark: "#171613", secondary: "#5a5f52" },
  { id: "sage", label: "Sage", mode: "light", light: "#f0f4ee", lightgray: "#dae2d6", gray: "#5c6858", dark: "#131a12", secondary: "#3f6b4f" },
  { id: "graphite", label: "Graphite", mode: "light", light: "#e5e5e5", lightgray: "#c4c4c4", gray: "#4a4a4a", dark: "#0a0a0a", secondary: "#262626" },
  { id: "newsprint", label: "Newsprint", mode: "light", light: "#f2f2f0", lightgray: "#dedede", gray: "#626266", dark: "#131315", secondary: "#2f4f7a" },
  { id: "ink", label: "Ink", mode: "dark", light: "#0a0a0a", lightgray: "#2e2e2e", gray: "#a3a3a3", dark: "#ededed", secondary: "#f5f5f5" },
  { id: "gruvbox", label: "Gruvbox", mode: "dark", light: "#1d2021", lightgray: "#3c3836", gray: "#a89984", dark: "#fbf1c7", secondary: "#fabd2f" },
  { id: "nord", label: "Nord", mode: "dark", light: "#2e3440", lightgray: "#3b4252", gray: "#a3adc2", dark: "#eceff4", secondary: "#88c0d0" },
  { id: "carbon", label: "Carbon", mode: "dark", light: "#171717", lightgray: "#333333", gray: "#a8a8a8", dark: "#f5f5f5", secondary: "#e5e5e5" },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    mode: "dark",
    light: "#002b36",
    lightgray: "#0d3d49",
    gray: "#93a8ae",
    dark: "#eee8d5",
    secondary: "#b58900",
  },
  { id: "one-dark", label: "One Dark", mode: "dark", light: "#282c34", lightgray: "#3b414d", gray: "#a2a9b6", dark: "#f0f2f6", secondary: "#61afef" },
  { id: "midnight", label: "Midnight", mode: "dark", light: "#10151f", lightgray: "#232b3a", gray: "#97a2b6", dark: "#eef1f7", secondary: "#7aa2f7" },
  { id: "mocha", label: "Mocha", mode: "dark", light: "#1e1a17", lightgray: "#332c27", gray: "#b0a090", dark: "#f5ede4", secondary: "#d8a25e" },
];

export const TYPE_STEP = { min: -2, max: 4 } as const;
export const MEASURE_STEP = { min: -9, max: 12 } as const;

export interface ReadingPrefs {
  palette: string;
  typeface: string;
  typeStep: number;
  measureStep: number;
  bold: boolean;
  bionic: boolean;
  focus: boolean;
}

export const DEFAULT_PREFS: ReadingPrefs = {
  palette: "galaxy",
  typeface: "source-serif",
  typeStep: 0,
  measureStep: 0,
  bold: false,
  bionic: false,
  focus: false,
};

const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, Math.trunc(n)));
const isId = <T extends { id: string }>(list: T[], id: unknown): id is string => typeof id === "string" && list.some((x) => x.id === id);

/** Repairs stored prefs: unknown ids fall back, steps clamp, flags coerce. */
export const normalizePrefs = (raw: unknown, _systemDark = false): ReadingPrefs => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ReadingPrefs, unknown>>;
  return {
    palette: isId(PALETTES, r.palette) ? r.palette : DEFAULT_PREFS.palette,
    typeface: isId(TYPEFACES, r.typeface) ? r.typeface : DEFAULT_PREFS.typeface,
    typeStep: clamp(Number(r.typeStep) || 0, TYPE_STEP),
    measureStep: clamp(Number(r.measureStep) || 0, MEASURE_STEP),
    bold: r.bold === true,
    bionic: r.bionic === true,
    focus: r.focus === true,
  };
};

export const paletteOf = (id: string) => PALETTES.find((p) => p.id === id) ?? (PALETTES[0] as Palette);
export const typefaceOf = (id: string) => TYPEFACES.find((t) => t.id === id) ?? (TYPEFACES[0] as Typeface);

/** Opaque floating-surface colour (menus, popovers, dialogs): lifted from the page so it reads over any backdrop. */
export const popoverOf = (p: Palette) =>
  p.mode === "dark" ? `color-mix(in srgb, ${p.lightgray} 40%, ${p.light})` : `color-mix(in srgb, #ffffff 65%, ${p.light})`;

/** CSS custom properties a palette sets on :root (the site's design tokens). */
export const paletteVars = (p: Palette): Record<string, string> => ({
  "--surface": p.light,
  "--surface-2": `color-mix(in srgb, ${p.lightgray} 55%, ${p.light})`,
  "--popover": popoverOf(p),
  "--line": p.lightgray,
  "--subtle": p.lightgray,
  "--muted": p.gray,
  "--fg": p.dark,
  "--accent": p.secondary,
  "--accent-hover": `color-mix(in srgb, ${p.secondary} 85%, ${p.dark})`,
  "--on-accent": p.mode === "light" ? "#ffffff" : p.light,
  // dark palettes keep "inverse" chips tinted and dark, so nothing flips to a white slab over the sky
  "--inverse":
    p.id === "galaxy" ? "#1c1f55" : p.id === "daylight" ? "#1a1f5c" : p.mode === "dark" ? `color-mix(in srgb, ${p.secondary} 22%, ${p.light})` : p.dark,
  "--on-inverse": p.mode === "dark" ? p.dark : p.light,
});

/** Article font size in px for a step (base 20px desktop, like the design). */
export const articleFontPx = (step: number) => 20 + clamp(step, TYPE_STEP) * 1;
/** Article column width in ch; a wider margin is a shorter line. */
export const measureCh = (step: number) => 80 + clamp(step, MEASURE_STEP) * 4;

/** Characters to embolden in a word: 1 for ≤3, else the leading 40%. */
export const fixationLength = (word: string) => (word.length <= 1 ? word.length : word.length <= 3 ? 1 : Math.ceil(word.length * 0.4));

/**
 * Splits text into bionic segments: [bold prefix, rest] per word, keeping
 * whitespace and punctuation intact. Words shorter than `min` stay plain.
 */
export const bionicSegments = (text: string, min = 3): { b?: string; t: string }[] => {
  const out: { b?: string; t: string }[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)(.*)$/u.exec(part);
    if (!m || (m[2] as string).length < min) {
      out.push({ t: part });
      continue;
    }
    const [, lead = "", word = "", trail = ""] = m;
    const cut = fixationLength(word);
    if (lead) out.push({ t: lead });
    out.push({ b: word.slice(0, cut), t: word.slice(cut) + trail });
  }
  return out;
};
