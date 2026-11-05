# iBlog public site redesign spec: "Graphite"

Status: proposed. Scope: public reading surfaces only (Landing, Home feed, Article, shared chrome). Writer and settings pages inherit the tokens and get no separate spec.
Owner constraints: very modern, **must not read as Medium**, three.js 3D element, **zero pink**, grayscale palette (monochrome preferred), ReadingDock on every page.

Decision: **fully monochrome**. `--accent` is ink (near-black in light mode, near-white in dark mode). I considered and rejected a cool-steel accent (`#4b5563`-ish). It reads as "disabled" next to gray body text, and it adds a hue the owner did not ask for.

How we avoid looking like Medium. Medium uses a white page, a centred serif column, a green accent, pill buttons and no imagery chrome. Graphite is the opposite on every one of those:
- Tight grotesk display type (Inter Tight).
- Monospace metadata and index numbers.
- Square-ish 10-16 px radii.
- Hairline grid rules.
- An indexed, two-column feed.
- A 3D hero object.
- Dark-first chrome.

---

## 0. Ground truth read before writing (current state)

| Fact | Source |
|---|---|
| Tokens are runtime vars, swapped by `.dark` and by inline `paletteVars` on `:root` | `src/styles.css:62-97`, `src/contexts/preferences/domain/reading.ts:191-203` |
| `paletteVars` **overrides** `--surface, --surface-2, --line, --subtle, --muted, --fg, --accent, --accent-hover, --on-accent, --inverse, --on-inverse` at runtime. `--surface-2` is computed as `color-mix(lightgray 55%, light)`. `--card`, `--danger`, `--overlay` and `--glow` are **not** overridden | `reading.ts:191-203` |
| Pink sources today: `--brand-2` mixes `#ff4fa3`, `--brand-3` mixes `#ff9d3d`, and `--grad-brand` is used by the Logo tile, drop cap, `hr`, `.text-gradient`, `.ring-grad`, landing CTA band and feature icons | `styles.css:300-303`, `Logo.tsx:13`, `LandingPage.tsx:247,259` |
| Violet accent `#5b3df5` / `#a495ff` | `styles.css:69,87`, `reading.ts:119,128` |
| Palettes `dawn` (`#fbf3f0` rose page, `#9c4a52` accent) and `dracula` (`#bd93f9`) are pink/violet-adjacent and visible in the dock swatches (`PALETTES.slice(0,12)`) | `reading.ts:126,131`, `ReadingPanel.tsx:154` |
| Fonts load from one Google Fonts URL | `index.html:11` |
| `three` is **not** a dependency | `package.json:16-32` |
| ReadingDock is mounted in the root route, outside `Shell`, and has no `data-chrome`, so focus mode does not hide it | `src/app/router.tsx:93`, `styles.css:238` |

---

## 1. Tokens

All neutrals are pure grays (R = G = B). No hue anywhere except `--danger`, which is a red with no blue component (not pink).

### 1.1 `:root` (light), replaces `styles.css:62-79`

```css
:root {
  --fg: #0a0a0a;
  --muted: #525252;
  --subtle: #d4d4d4;        /* decorative only */
  --surface: #f5f5f5;
  --surface-2: #e3e3e3;     /* = runtime value paletteVars computes for "paper" */
  --line: #d4d4d4;          /* decorative hairlines */
  --line-strong: #8a8a8a;   /* NEW: input/control borders that must meet 3:1 */
  --accent: #171717;
  --accent-hover: #404040;
  --on-accent: #fafafa;
  --inverse: #0a0a0a;
  --on-inverse: #f5f5f5;
  --danger: #b91c1c;
  --overlay: rgb(10 10 10 / 0.55);
  --card: #ffffff;
  --glow: color-mix(in srgb, var(--fg) 6%, transparent);
  color-scheme: light;
}
```

### 1.2 `.dark`, replaces `styles.css:80-97`

```css
.dark {
  --fg: #ededed;
  --muted: #a3a3a3;
  --subtle: #2e2e2e;
  --surface: #0a0a0a;
  --surface-2: #1e1e1e;     /* = runtime value for "ink" */
  --line: #2e2e2e;
  --line-strong: #6b6b6b;
  --accent: #f5f5f5;
  --accent-hover: #d4d4d4;
  --on-accent: #0a0a0a;
  --inverse: #ededed;
  --on-inverse: #0a0a0a;
  --danger: #f87171;
  --overlay: rgb(0 0 0 / 0.72);
  --card: #141414;
  --glow: color-mix(in srgb, var(--fg) 5%, transparent);
  color-scheme: dark;
}
```

Add to the first `@theme` block: `--color-line-strong: var(--line-strong);`. This is a **new token**.

### 1.3 Palette entries, replace `reading.ts:119` and `reading.ts:128`

```ts
{ id: "paper", label: "Paper", mode: "light", light: "#f5f5f5", lightgray: "#d4d4d4", gray: "#525252", dark: "#0a0a0a", secondary: "#171717" },
{ id: "ink",   label: "Ink",   mode: "dark",  light: "#0a0a0a", lightgray: "#2e2e2e", gray: "#a3a3a3", dark: "#ededed", secondary: "#f5f5f5" },
```

What these produce at runtime, derived from `paletteVars`:
- `--surface-2`: paper `#e3e3e3`, ink `#1e1e1e`.
- `--accent-hover = mix(secondary 85%, dark)`: paper ≈ `#101010`, ink ≈ `#f4f4f4`. That is visually the same as `--accent`. **So hover must never be signalled by colour alone.** Every accent hover in this spec also changes translate, underline or background.
- Optional follow-up, not required for this pass: change `paletteVars` to `color-mix(in srgb, ${p.secondary} 80%, ${p.light})` to restore a visible hover tint.

Other palettes:
- **Replace `dawn`** with `{ id: "graphite", label: "Graphite", mode: "light", light: "#e5e5e5", lightgray: "#c4c4c4", gray: "#4a4a4a", dark: "#0a0a0a", secondary: "#262626" }`. Reason: its page `#fbf3f0` and accent `#9c4a52` are rose.
- **Replace `dracula`** with `{ id: "carbon", label: "Carbon", mode: "dark", light: "#171717", lightgray: "#333333", gray: "#a8a8a8", dark: "#f5f5f5", secondary: "#e5e5e5" }`. Reason: its accent `#bd93f9` is violet-pink.
- `normalizePrefs` already falls back to paper/ink for unknown stored ids (`reading.ts:177`), so users who stored `dawn`/`dracula` degrade safely.
- The other palettes (sepia, nord, …) stay as reader-chosen options. They are not the site identity.

### 1.4 Brand gradient, replaces `styles.css:300-303`

```css
:root {
  --brand-2: #404040;
  --brand-3: #737373;
  --grad-brand: linear-gradient(120deg, #0a0a0a, var(--brand-2) 50%, var(--brand-3));
}
.dark {
  --brand-2: #bdbdbd;
  --brand-3: #8a8a8a;
  --grad-brand: linear-gradient(120deg, #fafafa, var(--brand-2) 50%, var(--brand-3));
}
```

The lightest stop is chosen so that `.text-gradient` (used only at ≥ 24 px bold, which counts as large text) stays ≥ 3:1. Ratios are in 1.5.

Body backdrop, replaces `styles.css:474-477`. Drop the `--brand-2` radial blob:

```css
body {
  background: radial-gradient(60rem 40rem at 110% -10%, var(--glow), transparent 60%), var(--surface);
  background-attachment: fixed;
}
```

### 1.5 Contrast (WCAG 2.x relative luminance, computed by hand from the hex values above)

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| fg on surface | 18.2:1 (`#0a0a0a`/`#f5f5f5`) | 16.9:1 (`#ededed`/`#0a0a0a`) | 4.5 ✓ |
| fg on card | 19.8:1 (`/#fff`) | 15.7:1 (`/#141414`) | 4.5 ✓ |
| fg on surface-2 | 15.4:1 (`/#e3e3e3`) | 14.1:1 (`/#1e1e1e`) | 4.5 ✓ |
| muted on surface | 7.2:1 (`#525252`) | 7.9:1 (`#a3a3a3`) | 4.5 ✓ |
| muted on card | 7.8:1 | 7.3:1 | 4.5 ✓ |
| muted on surface-2 | 6.1:1 | 6.5:1 | 4.5 ✓ |
| on-accent on accent | 17.2:1 (`#fafafa`/`#171717`) | 18.2:1 (`#0a0a0a`/`#f5f5f5`) | 4.5 ✓ |
| on-accent on accent-hover (static CSS) | 9.9:1 (`/#404040`) | 13.4:1 (`/#d4d4d4`) | 4.5 ✓ |
| accent (focus ring) on surface | 16.5:1 | 18.2:1 | 3 ✓ |
| line-strong on surface / card | 3.2:1 / 3.5:1 | 3.7:1 / 3.5:1 | 3 (non-text UI) ✓ |
| danger on surface | 5.9:1 (`#b91c1c`) | 7.2:1 (`#f87171`) | 4.5 ✓ |
| grad lightest stop on surface (large text) | 4.4:1 (`#737373`) | 5.7:1 (`#8a8a8a`) | 3 ✓ |
| `--line` on surface | 1.4:1 | 1.3:1 | decorative only. **Never use it as the only border of an input, switch or tab** |

Method: L = 0.2126R + 0.7152G + 0.0722B on linearised sRGB, and ratio = (L1 + 0.05) / (L2 + 0.05). These figures are not tool-measured. Design QA should re-run them in a contrast checker; any discrepancy above ±0.1 means a typo in this file.

---

## 2. Typography (Google Fonts only)

Replace `index.html:11` with:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500..800&family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,700;1,8..60,400&display=swap" rel="stylesheet" />
```

| Role | Token | Stack | Use |
|---|---|---|---|
| Display | `--font-display` | `"Inter Tight", "Geist", ui-sans-serif, system-ui, sans-serif` | h1-h3, card titles. Weight 700-800, tracking `-0.04em` at ≥ 48 px and `-0.02em` below |
| UI | `--font-sans` | `"Geist", ui-sans-serif, system-ui, sans-serif` | body chrome, buttons |
| Mono | `--font-mono` | `"Geist Mono", ui-monospace, Menlo, monospace` | kickers, dates, counts, index numbers, `kbd` |
| Article | `--font-serif` | unchanged, `"Source Serif 4"` | default `prose-article`. The user can switch it via the dock |

Removed: Bricolage Grotesque and Instrument Serif. The italic-serif accent words are a Medium-adjacent editorial cue. Remove every `font-italic font-normal italic` span in `LandingPage.tsx:32,241` and `HomePage.tsx:54,58` and render those words in display weight 800 instead. Delete the `--font-italic` token.

JetBrains Mono stays as a reader typeface option (`reading.ts:96`). Because it is no longer preloaded, add an `href` to it: `${GF}JetBrains+Mono:wght@400;600&display=swap`.

Type scale (px, line-height):
- Hero: `clamp(3.5rem, 9vw, 8rem)`, 0.88.
- Page h1: 40/44 desktop, 32/36 mobile.
- Article h1: 56/60 desktop, 34/38 mobile.
- Card title: 22/28 desktop, 18/24 mobile.
- Body: 15/24.
- Meta: 13/18 mono.
- Kicker: 12/16 mono, uppercase, tracking `0.12em`.

---

## 3. Radius, shadow and motion scale

Add to `@theme`. These are new tokens and replace `--radius-card: 1.5rem`:

```css
--radius-xs: 0.25rem;   /* 4  kbd, inline code */
--radius-sm: 0.5rem;    /* 8  chips, inputs */
--radius-md: 0.625rem;  /* 10 buttons */
--radius-lg: 1rem;      /* 16 cards, panels, menus */
--radius-xl: 1.25rem;   /* 20 modals, dock panel */
--radius-card: var(--radius-lg);
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
```

There are no full pills anywhere except the avatar and the switch track. Pills read as Medium.

Shadows, replacing `styles.css:304-305`. They are pure black alpha; in dark mode they are a hairline highlight because drop shadows vanish on `#0a0a0a`.

```css
:root {
  --shadow-soft: 0 1px 2px rgb(0 0 0 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.14);
  --shadow-lift: 0 2px 6px rgb(0 0 0 / 0.06), 0 24px 48px -20px rgb(0 0 0 / 0.24);
}
.dark {
  --shadow-soft: 0 0 0 1px rgb(255 255 255 / 0.04) inset, 0 8px 24px -12px rgb(0 0 0 / 0.8);
  --shadow-lift: 0 0 0 1px rgb(255 255 255 / 0.07) inset, 0 24px 48px -16px rgb(0 0 0 / 0.9);
}
```

Delete `--shadow-[0_8px_24px_-10px_var(--accent)]`-style coloured glows everywhere: `TopBar.tsx:192`, `button.tsx:11-12`, `ReadingPanel.tsx:183`, `Logo.tsx:12`. Use `shadow-[var(--shadow-soft)]` or `shadow-[var(--shadow-lift)]`.

`.ring-grad::before` keeps its mechanism but uses `background: var(--fg); opacity` up to `0.9`, so the hover ring is a 1 px ink outline.

Delete `animate-blob`, the `Mesh` component and `.dots` behind the hero. The 3D scene replaces them. Keep `.grain` at `opacity: 0.04`.

---

## 4. Components

Below, `·` separates class groups for readability. Write them as one `className` string.

### 4.1 TopBar (`src/app/layout/TopBar.tsx`)

- Header: `sticky top-0 z-40 h-16 border-b border-transparent transition-colors duration-300`. When scrolled: `glass border-line`. This is a full-bleed bar, not a floating rounded capsule.
- Inner: `mx-auto flex h-full max-w-shell items-center gap-6 px-4 md:px-6`.
- Nav links (new, desktop only): `hidden md:flex items-center gap-1`. Each link: `h-9 px-3 rounded-[var(--radius-sm)] font-mono text-[12px] uppercase tracking-[0.12em] text-muted hover:text-fg hover:bg-surface-2 data-[status=active]:text-fg data-[status=active]:bg-surface-2`. The items are "Latest" (`/?tab=latest`) and "Topics" (`/search`). This is a **new element**; if out of scope, omit it and nothing else breaks.
- SearchBox: `hidden md:flex h-10 w-64 focus-within:w-80 items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-sm text-muted transition-[width,border-color] duration-300 focus-within:border-fg`. Remove `ring-accent/30 focus-within:ring-4`. The `kbd` uses `rounded-[var(--radius-xs)] border border-line bg-surface-2 px-1.5 font-mono text-[11px]`.
- Write link: `hidden md:inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-inverse px-3.5 text-sm font-semibold text-on-inverse hover:-translate-y-px transition`.
- Bell badge: `bg-fg text-surface font-mono text-[10px]` (was accent).
- Avatar trigger: `rounded-full ring-offset-2 ring-offset-surface hover:ring-2 hover:ring-fg/40`.
- Menu content: `menu-pop z-50 w-64 rounded-[var(--radius-lg)] border border-line bg-card p-1.5 shadow-[var(--shadow-lift)]`. Items keep `item` but use `rounded-[var(--radius-sm)]`.
- Signed-out state: "Sign in" as `Button variant="ghost" size="sm"` and "Get started" as `Button size="sm"` (primary = inverse).
- Mobile (< md): Logo, search icon, theme toggle and avatar or "Get started". Every target is ≥ 40 × 40 px (`ghost-icon` is `size-10`). That exceeds the 24 × 24 minimum in WCAG 2.2 2.5.8.
- Worst-case content: a 30-character username in the menu footer is already truncated with `max-w-24 truncate`, and the unread count caps at "9+".

### 4.2 Logo (`src/app/layout/Logo.tsx`)

The wordmark is `iBlog` with a solid square mark. There is no gradient and no coloured dot.

```tsx
<span className="inline-flex items-center gap-2 font-display text-[22px] font-extrabold tracking-[-0.05em]">
  <span aria-hidden className="relative grid size-7 place-items-center rounded-[var(--radius-sm)] bg-inverse font-mono text-[15px] font-medium text-on-inverse transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:rotate-90">i</span>
  <span>Blog</span>
</span>
```

- Remove `<span className="text-accent">.</span>`.
- Link: `group text-fg active:scale-95 transition-transform`.
- The `group-hover:rotate-90` turn is suppressed by the global reduced-motion rule (`styles.css:206-215`).

### 4.3 Landing hero (`src/app/pages/LandingPage.tsx`)

Layout:
- Section: `relative isolate overflow-hidden border-b border-line`.
- Grid: `mx-auto grid max-w-shell items-center gap-10 px-4 pt-14 pb-16 md:px-6 md:pt-20 md:pb-24 lg:grid-cols-[1.1fr_1fr]`.
- The `aside` scene slot: `relative aspect-square w-full max-w-[36rem] justify-self-center lg:justify-self-end`. **On mobile it shows above the headline at `max-w-[20rem]`** via `order-first lg:order-none`. Mobile gets the 3D element too, under the reduced budget in 4.3.3.
- The badge drops the ping dot. It becomes `inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-card px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-muted` with a 6 px `bg-fg` square.
- Headline: `font-display text-[clamp(3.5rem,9vw,8rem)] leading-[0.88] font-extrabold tracking-[-0.055em]`. "Ideas worth" is in `text-fg`. The rotating word uses `.text-gradient`, in display weight 800, not italic.
- Lede: `mt-8 max-w-lg text-lg leading-7 text-muted md:text-xl md:leading-8`.
- CTAs:
  - Primary: `Button size="lg" className="h-12 px-7"` (inverse).
  - Secondary: `Button variant="outline" size="lg" className="h-12 px-7"`.
  - Keep `Magnetic`.
- Stats `dl`: `mt-12 grid grid-cols-3 divide-x divide-line border-y border-line`. Each cell: `px-4 py-4 first:pl-0`. `dd` is `font-mono text-3xl font-medium tabular-nums`. `dt` is `kicker mt-1`.
- The 3 floating `StoryCard`s are **removed** from the hero. They were the "pile of cards" look. Trending moves to the section below unchanged, restyled per 4.5. Index numbers there use `font-mono text-[28px] text-subtle group-hover:text-fg`.
- Feature tiles: `.panel ring-grad p-6`. The icon tile becomes `grid size-10 place-items-center rounded-[var(--radius-sm)] bg-inverse text-on-inverse`, replacing `style={{background: var(--grad-brand)}}`.
- Final CTA band: `bg-inverse text-on-inverse rounded-[var(--radius-xl)]`, replacing the gradient. Its buttons:
  - Primary: `bg-on-inverse text-inverse`.
  - Outline: `border-on-inverse/40 text-on-inverse hover:bg-on-inverse/10`.
- Topic marquee chips: `rounded-[var(--radius-sm)] border border-line bg-card px-4 py-2 font-mono text-[13px] hover:border-fg hover:text-fg`.

#### 4.3.1 three.js scene: "Monolith"

The scene is one faceted metal polyhedron, wrapped by a wire cage and orbited by a sparse particle shell. Everything is grayscale and tinted from runtime tokens.

| Aspect | Spec |
|---|---|
| Dependency | `bun add three` and `bun add -d @types/three` (latest) |
| File | `src/app/pages/landing/HeroScene.tsx` (default export), lazy-loaded |
| Renderer | `WebGLRenderer({ antialias: dpr < 2, alpha: true, powerPreference: "low-power" })`, `setClearColor(0x000000, 0)`, `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = 1.0` |
| Camera | `PerspectiveCamera(35, aspect, 0.1, 50)` at `(0, 0, 6.5)`, looking at the origin |
| Core mesh | `IcosahedronGeometry(1.35, 0)` (20 faces, flat facets) + `MeshStandardMaterial({ color: muted, metalness: 0.85, roughness: 0.32, flatShading: true })` |
| Cage | `EdgesGeometry(IcosahedronGeometry(1.9, 1))` + `LineBasicMaterial({ color: fg, transparent: true, opacity: 0.18 })` |
| Particles | 900 points (420 on mobile) uniformly on a spherical shell r ∈ [2.6, 4.2] + `PointsMaterial({ color: fg, size: 0.018, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false })` |
| Environment | `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture` (`three/addons/environments/RoomEnvironment.js`). It is generated locally, so there is **no network fetch**. Dispose `pmrem` right after |
| Lights | `AmbientLight(0xffffff, 0.25)` + key `DirectionalLight(0xffffff, 2.2)` at `(3, 4, 5)` + rim `DirectionalLight(0xffffff, 0.9)` at `(-4, -2, -3)`. All white, so they add no hue |
| Colour source | Read `getComputedStyle(document.documentElement).getPropertyValue("--fg" / "--muted")` on mount, then re-read through a `MutationObserver` on `<html>` (`attributes: true, attributeFilter: ["class","style"]`), because a palette change sets inline vars and `.dark`. Apply with `material.color.set(value)`. Any palette, including sepia, therefore tints the object to that palette |
| Idle motion | Core `rotation.y += 0.12·dt`, `rotation.x += 0.04·dt`. Cage counter-rotates `rotation.y -= 0.05·dt`. Particles `rotation.y += 0.015·dt`. Group `position.y = 0.08·sin(t·0.6)`. `dt` comes from `Clock.getDelta()`, clamped to `≤ 0.05` s so resuming from a pause does not jump |
| Mouse parallax | `pointermove` on `window` (passive) maps `nx, ny ∈ [-1, 1]` from the canvas rect. Targets: `group.rotation.x = ny·0.25`, `group.rotation.y = nx·0.35`, `camera.position.x = nx·0.35`, `camera.position.y = -ny·0.25`. Ease each frame with `v += (target - v)·0.06`. Then `camera.lookAt(0,0,0)`. On touch there is no parallax, only `deviceorientation`. **Do not** request iOS motion permission |
| Hover/click | None. The canvas is `aria-hidden` and `pointer-events-none`; it is decoration |
| Entry | Scale the group 0.85 → 1 and fade the canvas `opacity` 0 → 1 over 900 ms with `var(--ease-out)` after the first rendered frame |
| Resize | `ResizeObserver` on the container calls `renderer.setSize(w, h, false)` and `camera.aspect` → `updateProjectionMatrix()` |

#### 4.3.2 Reduced motion and fallbacks

- `prefers-reduced-motion: reduce` (use `useReducedMotion()` from `@/shared/motion`): render **one** frame with the core at rotation `(0.35, 0.6, 0)`. There is no rAF loop and no parallax. Listen for media-query changes and start or stop the loop when the setting changes.
- No WebGL (`!canvas.getContext("webgl2") && !getContext("webgl")`), a lazy-import failure or a `webglcontextlost` event: render the **static fallback**. The fallback is an inline SVG of the icosahedron's outline (12 polygons with `stroke="currentColor"` and `class="text-subtle"`, plus 3 faces filled `fill-surface-2`) in the same `aspect-square` box. The layout must not shift.
- Suspense fallback while the chunk loads is the same static SVG. That gives zero CLS.

#### 4.3.3 Performance budget

| Item | Budget / rule |
|---|---|
| Code split | `const HeroScene = lazy(() => import("./landing/HeroScene"))`. Start the import from `requestIdleCallback` (falling back to `setTimeout(…, 200)`) after the hero text paints, so three is never in the entry chunk. Import only the named pieces: `import { WebGLRenderer, … } from "three"` |
| Chunk size | Target ≤ 160 KB gzip for the HeroScene chunk including three. This is a **budget, not a measurement**. Verify with `bunx --bun vite build` output, and fail review if it is over |
| DPR | `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))`. On viewports < 768 px, cap at `1.5` |
| Frame | Target ≤ 4 ms CPU per frame on a mid-range laptop. Validate in a Chrome Performance trace. Draw calls: 3. Triangles: 20 core + 0 for lines and points |
| Offscreen | An `IntersectionObserver` (threshold 0) on the container stops the rAF loop when it is not intersecting |
| Tab hidden | `document.visibilitychange` stops the loop on `hidden` and resumes on `visible` (call `clock.getDelta()` once to discard the gap) |
| Cleanup | On unmount: cancel rAF, disconnect observers, `geometry.dispose()`, `material.dispose()`, `scene.environment.dispose()`, `renderer.dispose()`, `renderer.forceContextLoss()`, and remove listeners |
| Contexts | Only **one** WebGL context exists site-wide |

Ambient background, the owner's "maybe": **rejected** as a global three.js layer. A second always-on WebGL context behind long-form reading costs battery on every article. It competes with text at the contrast levels in 1.5, and it would also have to obey focus mode. Replacement: the existing body radial `--glow` at 5-6 % plus `.grain` on the Landing hero only. This needs zero JS.

### 4.4 Home feed header and tabs (`HomePage.tsx`, `modal.tsx` `Tabs`)

- Header: `pt-6 pb-4 border-b border-line`.
  - Kicker: the date, in `kicker`.
  - h1: `mt-2 font-display text-[32px] leading-9 font-extrabold tracking-[-0.03em] md:text-[40px] md:leading-[44px]`.
  - Copy, signed in: "Hey {first}, read something good." Copy, signed out: "Fresh on iBlog". There is no accent or italic span; the second clause is `text-muted`.
  - Worst case: a 40-character first name wraps through `text-balance` (already set on h1). The name is `split(" ")[0]`, so it is never truncated.
- Sticky nav: `sticky top-16 z-30 -mx-4 px-4 bg-surface/90 backdrop-blur-md border-b border-line md:-mx-0 md:px-0`. `top-16` matches the new 64 px TopBar.
- **Tabs restyle: underline segmented, not pills.**
  - Root: `overflow-x-auto [scrollbar-width:none]`.
  - Tablist: `flex gap-6`.
  - Tab: `relative h-12 shrink-0 font-mono text-[12px] uppercase tracking-[0.12em] text-muted hover:text-fg aria-selected:text-fg`.
  - Indicator: the `motion.span layoutId` becomes `absolute inset-x-0 -bottom-px h-0.5 bg-fg`, with the same spring `500/38`.
  - Add `aria-controls`/`id` is out of scope; that is behaviour that already exists.
- Mobile TopicChips row: `flex gap-2 overflow-x-auto py-3`. Chip: `h-8 px-3 rounded-[var(--radius-sm)] border border-line bg-card font-mono text-[12px] hover:border-fg`.

### 4.5 PostCard (`src/contexts/reading/ui/PostCard.tsx`): "index row"

This replaces the rounded floating card with a ruled row. That is the biggest single move away from both Medium and generic card-feed looks.

- Wrapper: `Reveal y={10}` with no padding.
- `article`: `group relative grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 border-b border-line py-6 md:grid-cols-[7rem_1fr_auto] md:gap-x-6`.
- Meta column, md+: `hidden md:block font-mono text-[12px] leading-5 text-muted` with `<time>` on line 1 and `readTime` on line 2.
- Author line, all sizes: `flex items-center gap-2 text-[13px] text-muted`. Avatar `xs`. Name: `max-w-[60%] truncate font-medium text-fg hover:underline underline-offset-4`. On mobile the date follows as `font-mono text-[12px]`.
- Title link: `mt-2 block` + h2 `line-clamp-3 font-display text-lg leading-6 font-bold tracking-[-0.02em] md:line-clamp-2 md:text-[22px] md:leading-7 group-hover:underline decoration-1 underline-offset-[5px]`. Hover is an underline, not a colour change.
- Excerpt: `mt-2 hidden line-clamp-2 text-[15px] leading-6 text-muted sm:block`.
- Cover: `relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-2 md:h-24 md:w-36`.
  - img: `size-full object-cover grayscale contrast-[1.05] transition duration-500 group-hover:grayscale-0 group-hover:scale-[1.04]`. This is the open question in Risks; the default keeps the UI monochrome.
  - The corner arrow chip becomes `bg-inverse/70 text-on-inverse rounded-[var(--radius-xs)]`.
- Footer row: `col-span-full flex flex-wrap items-center gap-2 text-[13px] text-muted md:col-start-2`.
  - Tags: `h-7 px-2 rounded-[var(--radius-xs)] border border-line font-mono text-[12px] hover:border-fg hover:text-fg` with the label `#{t}`.
  - Claps: `FlameIcon` becomes `text-fg` (was accent), with counts in `font-mono tabular-nums`.
  - Bookmark and menu stay at `ml-auto` and are 40 px targets.
- States:
  - No cover: the grid collapses to `[1fr]` / `md:[7rem_1fr]`. `onError` already hides the image (`PostCard.tsx:47-49`).
  - No author: the author line is omitted, as today.
  - 0 claps and 0 comments: those spans are omitted, as today.
  - Long title (140 chars): clamped to 3 lines on mobile and 2 on desktop.
  - Long unbroken tag (`#kubernetesoperatorpatterns`): add `max-w-[12rem] truncate`.
- Skeleton (`PostCardSkeleton`, `states.tsx:26`): mirror the grid. Use `border-b border-line py-6`, not `.panel`.

### 4.6 Sidebar (`src/contexts/reading/ui/Sidebar.tsx`)

- Aside: `sticky top-16 hidden h-[calc(100dvh-4rem)] overflow-y-auto py-8 [scrollbar-width:none] lg:block space-y-0 divide-y divide-line border-l border-line pl-8`. There are no panels; sections are ruled.
- Section: `py-6 first:pt-0`. Title: `kicker mb-4`.
- Trending item: `group grid grid-cols-[2rem_1fr] gap-3`.
  - Index: `font-mono text-[13px] text-muted pt-0.5`, values `01` to `03`.
  - Title: `line-clamp-2 font-display text-[15px] leading-5 font-bold group-hover:underline underline-offset-4`.
  - Date: `font-mono text-[12px] text-muted`.
- Who to follow: `FollowButton` uses `Button variant="outline" size="sm"`. The name truncates. The followers count is `font-mono text-[12px]`.
- Footer links: these are currently non-link `<span>`s (`Sidebar.tsx:69-72`), which is a pre-existing gap. Either make them `<Link>`s to existing routes (`/terms`, `/privacy`) or delete "Help" and "About", which have no route. Styling: `font-mono text-[12px] text-muted hover:text-fg`.
- Loading: 3 rows of `Bone h-4` + `Bone h-3 w-1/3`. Empty: "Nothing trending yet." in `text-sm text-muted`, which exists already. Signed out: there is no "Who to follow" section, as today.

### 4.7 Article header and engagement (`src/app/pages/ArticlePage.tsx`)

- Kicker: `kicker mb-6 flex items-center gap-3` showing `#{tag}`, a 1 px × 12 px `bg-line` divider, then the read time.
- h1: `font-display text-[34px] leading-[38px] font-extrabold tracking-[-0.04em] text-balance md:text-[56px] md:leading-[60px]`.
- Subtitle: `mt-4 font-sans text-lg leading-7 text-muted md:text-[22px] md:leading-8`.
- Byline block: `mt-10 flex items-center gap-4 border-y border-line py-4`.
  - Avatar `lg`.
  - Name: `text-base font-semibold hover:underline`.
  - Follow: `Button variant="outline" size="sm"`, replacing the `link` variant (which used accent text).
  - "Edit" (owner only): `Button variant="ghost" size="sm"`.
  - Meta: `font-mono text-[12px] text-muted`.
  - Status chip (draft/unlisted): `rounded-[var(--radius-xs)] border border-line-strong px-1.5 py-0.5 font-mono text-[11px] uppercase`.
- EngagementBar becomes a **toolbar pill inside the column, sticky at the bottom on scroll**:
  - `role="toolbar"` and `sticky bottom-20 z-30 mx-auto mt-8 flex h-12 w-fit items-center gap-1 rounded-[var(--radius-lg)] border border-line bg-card/90 px-1.5 shadow-[var(--shadow-lift)] backdrop-blur-md`.
  - `bottom-20` clears the 48 px dock at `bottom-4`/`md:bottom-6`.
  - Groups are separated by `<span aria-hidden className="mx-1 h-5 w-px bg-line" />`.
  - Every action is `ghost-icon` (40 px). Counts are `font-mono text-[12px] tabular-nums`.
  - The **bottom** instance (`ArticlePage.tsx:215`) stays static: `border-y border-line h-12 justify-between`. Only the top instance becomes sticky, so only one toolbar is ever floating.
  - Clap active state: `text-fg` with `animate-clap-pop`. The bubble uses `bg-inverse text-on-inverse font-mono`.
- Cover image: `mt-10 w-full rounded-[var(--radius-lg)] border border-line`. It is **not** greyscaled, because the article is the user's content.
- Drop cap: keeps the `--grad-brand` clip, which is now grayscale. `hr` uses grayscale `--grad-brand`.
- Links in prose: `a:hover` becomes `text-decoration-thickness: 2px`. The current `text-accent` hover is invisible once accent ≈ fg.
- "Keep reading": `border-t border-line pt-12`, kicker title, and PostCard rows.
- Focus mode: TopBar, footer and "Keep reading" are hidden through `data-chrome` (existing). The sticky EngagementBar must **also** carry `data-chrome`, while the dock stays.
- States:
  - Loading: `ArticleSkeleton` (exists). Bones use `.shimmer` on gray tokens.
  - Not found (404): `EmptyState` with `FileQuestionIcon`, "This story doesn't exist or was removed.", and "Back to home".
  - Permission denied (403): same component with "You don't have access to this story." This already exists at `ArticlePage.tsx:128`.
  - Error (network or 5xx): this currently falls into the 404 copy, which is wrong. Add a third branch: title "Couldn't load this story.", body "Check your connection and try again.", action `Button variant="outline" onClick={() => q.refetch()}`. This is a **new copy string**; hand it to the Content Designer.

### 4.8 Buttons (`src/shared/ui/button.tsx`)

- `base`: replace `rounded-xl` with `rounded-[var(--radius-md)]`. Keep the rest. The focus outline stays `outline-accent`, which is now ink: 16.5:1 or better.

| Variant | Classes |
|---|---|
| `primary` | `bg-inverse text-on-inverse hover:-translate-y-px hover:shadow-[var(--shadow-lift)] shadow-[var(--shadow-soft)]` |
| `accent` | alias of `primary`. Keep the key for call sites, and **remove** the coloured glow |
| `outline` | `border border-line-strong bg-card text-fg hover:border-fg hover:bg-surface-2` |
| `outline-accent` | `border border-fg text-fg hover:bg-inverse hover:text-on-inverse` |
| `link` | `h-auto px-0 text-fg underline-offset-4 hover:underline decoration-1 rounded-none` |
| `ghost` | `text-muted hover:text-fg hover:bg-surface-2` |
| `ghost-icon` | `size-10 rounded-[var(--radius-md)] text-muted hover:text-fg hover:bg-surface-2 [&_svg]:size-5` (was size-6, which looked heavy at 1.5 stroke) |
| `danger` (**new**) | `bg-danger text-surface hover:opacity-90`. Destructive confirms currently borrow `primary` |

Sizes: unchanged (`sm` h-9 = 36 px, `md` 40, `lg` 44). All targets are ≥ 24 px for WCAG 2.2 AA (2.5.8).

States:
- Disabled: `disabled:opacity-50` exists. Muted at 50 % falls below 4.5:1. That is allowed, because WCAG exempts inactive components.
- Loading: spinner plus `aria-busy` (exists).

### 4.9 Modals (`src/shared/ui/modal.tsx`)

- Overlay: `overlay-fade fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]`.
- Content: `dialog-pop fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[var(--radius-xl)] border border-line bg-card p-6 shadow-[var(--shadow-lift)] md:inset-auto md:top-1/2 md:left-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-xl)]`.
- Mobile grab handle (**new**, decorative): `<span aria-hidden className="mx-auto -mt-2 mb-4 block h-1 w-10 rounded-full bg-line-strong md:hidden" />`.
- Title: `font-display text-xl font-bold tracking-[-0.02em]`. Description: `mt-1 text-sm text-muted`.
- Close: `ghost-icon`. Escape, overlay click and the focus trap come from Radix (unchanged).
- Long content: it scrolls inside `max-h-[90dvh]`. The title row does not stick; adding that is out of scope.

### 4.10 ReadingDock (`ReadingPanel.tsx`), on every page

- Mount point is unchanged (`router.tsx:93`). It must never get `data-chrome`.
- Trigger: `fixed right-4 bottom-4 z-40 size-12 rounded-[var(--radius-lg)] p-0 bg-inverse text-on-inverse shadow-[var(--shadow-lift)] md:right-6 md:bottom-6`. Remove `shadow-[…var(--accent)]`. The icon rotation on hover/open stays.
- Panel: `menu-pop z-50 max-h-[80dvh] w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-xl)] border border-line bg-card/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur-xl`.
- Header: `kicker mb-3` with the text "Reading settings".
- Swatches: `grid grid-cols-6 gap-2`. Each swatch is `aspect-square rounded-[var(--radius-sm)] border border-line-strong`. Selected: `ring-2 ring-fg ring-offset-2 ring-offset-card`. The secondary dot becomes `size-2 rounded-[2px]`. Show **paper, graphite, linen, newsprint, slate, ink, carbon, midnight, nord, one-dark, gruvbox, mocha** in that order. That needs a curated id list instead of `PALETTES.slice(0, 12)`, so the grays lead.
- Selects: `h-9 w-44 rounded-[var(--radius-sm)] border border-line-strong bg-card px-2 text-sm text-fg`.
- Step keys: `h-9 w-11 rounded-[var(--radius-sm)] border border-line-strong`.
- Switch:
  - Track off: `bg-line-strong` (was `bg-line` at 1.4:1, which failed the 3:1 non-text rule).
  - Track on: `bg-fg`.
  - Thumb: `bg-surface`.
  - Track `rounded-full` is allowed.
  - Hit target: 44 × 24 px. That meets 2.5.8 (≥ 24).
- Collision: the sticky EngagementBar sits at `bottom-20`, so it never overlaps the dock.

### 4.11 Footer (`src/app/layout/Footer.tsx`)

- `footer`: `mt-24 border-t border-line`.
- Inner: `mx-auto grid max-w-shell gap-8 px-4 py-10 md:grid-cols-[1fr_auto] md:px-6`.
- Left: `Wordmark` at `text-[18px]`, followed by `<p className="mt-2 font-mono text-[12px] text-muted">© {year} iBlog</p>`.
- Legal nav: `mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px] uppercase tracking-[0.12em] text-muted`. Links: `hover:text-fg`.
- Right: `Preferences`. Selects use `h-9 rounded-[var(--radius-sm)] border border-line-strong bg-card px-2 text-[13px]`, which takes them from 32 px to 36 px.
- Optional giant wordmark row (**new**, decorative, `aria-hidden`): `select-none overflow-hidden font-display text-[clamp(5rem,22vw,18rem)] leading-[0.8] font-extrabold tracking-[-0.06em] text-surface-2`. Omit it if footer height is a concern.

### 4.12 Empty and loading states (`src/shared/ui/states.tsx`)

- `EmptyState`:
  - Wrapper: `mx-auto max-w-sm py-20 text-center`.
  - Icon in a tile: `mx-auto grid size-14 place-items-center rounded-[var(--radius-lg)] border border-line bg-card`, with the icon `size-6 text-muted` inside.
  - Title: `mt-5 font-display text-xl font-bold tracking-[-0.02em]`.
  - Body: `mt-2 text-sm leading-6 text-muted`.
- `Bone`: `.shimmer` with `rounded-[var(--radius-xs)]`. The gradient already uses `--surface-2`/`--surface`, so it turns gray automatically. Reduced motion stops the shimmer (exists, `styles.css:394`).
- `Loading` keeps the 150 ms `Delayed` (exists), so fast loads do not flash.
- Feed end of list: `py-10 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-muted`, text "You're all caught up". This is a **new copy string**.
- Feed copy per tab, all existing:
  - `following` signed in with 0 follows: `UsersIcon`, title "Stories from writers you follow will appear here.", body "Follow writers from their profile or the sidebar."
  - `following` signed out: the tab click opens the sign-in dialog instead (`HomePage.tsx:67`). That is the permission-denied path; it has no separate screen.
  - `latest` with 0 posts: "No stories yet."
  - Feed error: whatever `Feed` renders today. Check `src/contexts/reading/ui/Feed.tsx`, which **I did not read**. If it has no retry, add `Button variant="outline"` "Try again".

---

## 5. Pink audit checklist (must be zero after the change)

`rg -n "ff4fa3|ff9d3d|5b3df5|a495ff|b8acff|4a2ee0|9c4a52|bd93f9|fbf3f0|text-gradient|grad-brand|accent\)" src index.html`

Each remaining hit must resolve to a grayscale value from section 1. The `.text-gradient` and `--grad-brand` hits are allowed, because the variables become gray.

---

## 6. New tokens and components introduced

- Tokens: `--line-strong` / `--color-line-strong`, `--radius-xs|sm|md|lg|xl`, `--ease-out` (referenced but never defined today; `styles.css:350` uses `var(--ease-out, ease)`), and dark-scoped `--brand-2/--brand-3/--grad-brand/--shadow-*`.
- Palettes: `graphite` replaces `dawn` and `carbon` replaces `dracula`. The dock gets a curated swatch order.
- Components:
  - `HeroScene` (three.js) and its static SVG fallback.
  - `Button` variant `danger`.
  - Modal grab handle.
  - TopBar desktop nav links (optional).
  - Footer giant wordmark (optional).
- Removed: `Mesh`, landing `StoryCard`, `--font-italic`, Bricolage Grotesque, Instrument Serif, and every coloured glow shadow.
- Copy (to Content Designer): "Couldn't load this story." / "Check your connection and try again." / "You're all caught up".

## 7. Out of scope

- Writer editor, settings, stats and publication pages: tokens only.
- Interactive mocks: this deliverable is a spec by request. The HTML mock alternatives are not produced here.
- `aria-controls` on Tabs.
- Sticky modal headers.
