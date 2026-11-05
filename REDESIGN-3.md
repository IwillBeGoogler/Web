# REDESIGN-3: "Console" component language (de-Medium, pass 3)

Status: spec only. Implement in one pass. Supersedes the component-level parts of REDESIGN.md / REDESIGN-2.md where they conflict; data/route decisions in REDESIGN-2 still hold.

Verified source of every "current" claim: the files listed per section, read 2026-10-06. Tokens: `src/styles.css`.

---

## 0. The language in one paragraph

**Console** = technical editorial / instrument panel. Everything sits in a **bordered tile** with a **mono header strip** (index number, label, count, keyboard hint). Corners are squared (4/8/10 px; nothing above 10 px except none). Depth comes from **borders and a 2 px hard offset shadow on hover**, never soft blur shadows. Metadata is **indexed and tabular** (`01`, `#tag·12`, `4 MIN`, `▲ 1.2K`). Actions are **grouped toolbars of labelled keys with counts**, not loose ghost icons. People are **square monograms + `@handle` mono labels**, not round photos beside a serif name. Reading cards are **bento tiles** (cover-as-background or split), not hairline rows. Selection is **segmented / inverted fill**, never underline. Grayscale only. Serif survives only inside `.prose-article` body text (user-selectable typeface) — nowhere in chrome.

### Medium DNA to Console replacement (checklist)

| Medium signature (current location) | Console replacement |
|---|---|
| Hairline-ruled list rows: `PostCard.tsx:30` `border-b py-6` | Bento tile grid, `.tile` with header strip |
| Round avatars: `avatar.tsx:43` `rounded-full` | Square monogram, `rounded-[var(--radius-xs|sm)]` |
| Pill/black lifted button: `button.tsx:9` shadow-soft + `-translate-y-px` | Flat "key" button, inset bottom edge, mono caps label |
| Ghost icon row bookmark/…/share: `ArticlePage.tsx:35-77`, `PostCard.tsx:105` | `ActionDeck`: segmented toolbar, each key = icon + label + count |
| Underline tabs: `modal.tsx:51-90` `Tabs` | `Tabs` restyled as segmented with inverted fill (role=tab kept) |
| Centered auth modal + big serif greeting: `AuthDialog.tsx:153-161` | Split-panel sheet: left spec panel (inverse), right form |
| Right-drawer / quiet comment list: `Responses.tsx:105` ruled `li` | Threaded "log" tiles with line numbers, square monograms, labelled action keys |
| Plain text topic pills: `TopicChips.tsx:4` | Bracketed hash tags with count well: `#devops 12` |
| Sparse white chrome: `TopBar.tsx:185` transparent header | Framed top bar with segmented nav + ⌘K command field + status rail |
| Soft-shadow cards `.card-premium`, `.panel` | `.tile` + `.tile-hover` (hard offset) |

---

## 1. Foundations (styles.css additions — the only CSS file change)

### 1.1 Radius mapping (no token value changes)

Use only existing vars; stop using `--radius-lg` (16) and `--radius-xl` (20) in components.

| Use | Var | px |
|---|---|---|
| kbd, tags, avatar xs/sm, count wells | `--radius-xs` | 4 |
| buttons, inputs, menu items, segmented items, avatar md/lg | `--radius-sm` | 8 |
| tiles, menus, modals, sheets, toasts, avatar xl/2xl | `--radius-md` | 10 |

One variable reassignment (flagged, not a new value): in the `:root` block at `styles.css:302` change `--radius-card: var(--radius-lg)` to `--radius-card: var(--radius-md)`. That moves every `.panel` / `.card-premium` user to 10 px.

### 1.2 New component classes (append to the last `@layer components` in `styles.css`)

They only combine existing tokens. **NEW (flag for design system):** `.tile`, `.tile-hover`, `.tile-head`, `.kbd`, `.tag`, `.tag-count`, `.seg`, `.seg-item`, `.key`, `.idx`, `.hatch`.

```css
@layer components {
  /* Bordered surface. Replaces .panel / .card-premium in components. */
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md); }
  /* Hover = border goes solid + 2px hard offset, no blur. */
  .tile-hover { transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out), border-color 160ms; }
  .tile-hover:hover, .tile-hover:focus-within { border-color: var(--fg); transform: translate(-2px, -2px); box-shadow: 2px 2px 0 0 var(--fg); }
  @media (prefers-reduced-motion: reduce) { .tile-hover:hover, .tile-hover:focus-within { transform: none; } }
  /* Mono header strip inside a tile. */
  .tile-head {
    display: flex; align-items: center; gap: 0.75rem; min-height: 2.25rem; padding: 0 0.75rem;
    border-bottom: 1px solid var(--line); background: var(--surface-2);
    border-radius: calc(var(--radius-md) - 1px) calc(var(--radius-md) - 1px) 0 0;
    font-family: var(--font-mono); font-size: 0.6875rem; line-height: 1rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
  }
  /* Zero-padded index numerals: 01, 02 … */
  .idx { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--muted); }
  /* Keyboard hint. Decorative: always aria-hidden. */
  .kbd {
    display: inline-grid; place-items: center; height: 1.25rem; min-width: 1.25rem; padding: 0 0.25rem;
    border: 1px solid var(--line-strong); border-bottom-width: 2px; border-radius: var(--radius-xs);
    background: var(--card); font-family: var(--font-mono); font-size: 0.6875rem; line-height: 1; color: var(--muted);
  }
  /* Hash tag with count well. */
  .tag {
    display: inline-flex; align-items: center; gap: 0.375rem; height: 1.75rem; max-width: 14rem; padding: 0 0.25rem 0 0.5rem;
    border: 1px solid var(--line-strong); border-radius: var(--radius-xs); background: var(--card);
    font-family: var(--font-mono); font-size: 0.75rem; color: var(--fg); white-space: nowrap; transition: background-color 120ms, border-color 120ms, color 120ms;
  }
  .tag:hover { border-color: var(--fg); background: var(--surface-2); }
  .tag[aria-current="page"] { background: var(--inverse); color: var(--on-inverse); border-color: var(--inverse); }
  .tag-count { border-radius: 2px; background: var(--surface-2); padding: 0 0.25rem; font-size: 0.6875rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .tag[aria-current="page"] .tag-count { background: color-mix(in srgb, var(--on-inverse) 18%, transparent); color: var(--on-inverse); }
  /* Segmented control shell + item (used by Lens, Tabs, ActionDeck, ReadingPanel). */
  .seg { display: inline-flex; align-items: stretch; gap: 2px; padding: 2px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface-2); }
  .seg-item {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; height: 2rem; padding: 0 0.75rem;
    border-radius: calc(var(--radius-sm) - 3px); font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--muted); transition: background-color 120ms, color 120ms; cursor: pointer;
  }
  .seg-item:hover { color: var(--fg); background: var(--card); }
  .seg-item[aria-checked="true"], .seg-item[aria-selected="true"], .seg-item[aria-pressed="true"] { background: var(--inverse); color: var(--on-inverse); }
  /* "Key" = one labelled cell in an action toolbar. */
  .key {
    display: inline-flex; align-items: center; gap: 0.5rem; height: 2.5rem; padding: 0 0.75rem;
    font-family: var(--font-mono); font-size: 0.75rem; color: var(--muted); font-variant-numeric: tabular-nums;
    transition: background-color 120ms, color 120ms; cursor: pointer;
  }
  .key:hover { background: var(--surface-2); color: var(--fg); }
  .key[aria-pressed="true"] { color: var(--fg); }
  .key:disabled, .key[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
  /* Diagonal hatch for empty media / placeholders (replaces giant letter). */
  .hatch { background: repeating-linear-gradient(-45deg, var(--surface-2) 0 6px, var(--card) 6px 12px); }
}
```

Delete from components (keep CSS definitions until a later cleanup pass so nothing else breaks): `card-premium`, `ring-grad`, `text-gradient` usages in the listed files. Drop cap rule (`styles.css:360-370`) stays — body copy only.

### 1.3 Contrast evidence (computed from token hex, WCAG relative luminance)

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| `text-muted` on `bg-surface-2` (tile-head, tag-count) | #525252/#e3e3e3 ≈ 6.1:1 | #a3a3a3/#1e1e1e ≈ 6.6:1 | 4.5:1 text |
| `text-muted` on `bg-card` | #525252/#fff ≈ 7.8:1 | #a3a3a3/#141414 ≈ 7.6:1 | 4.5:1 |
| `on-inverse` on `inverse` (selected seg, primary) | #f5f5f5/#0a0a0a ≈ 18:1 | #0a0a0a/#ededed ≈ 17:1 | 4.5:1 |
| `border-line-strong` vs `bg-card` (control edges) | #8a8a8a/#fff ≈ 3.5:1 | #6b6b6b/#141414 ≈ 3.4:1 | 3:1 non-text |
| `border-line` | ≈ 1.5:1 | ≈ 1.4:1 | decorative only; never the sole state cue |

Rule: any control whose boundary conveys "this is clickable" uses `border-line-strong`. `border-line` only on tiles whose content is itself a link with visible text.

### 1.4 Target sizes (WCAG 2.2 SC 2.5.8, 24×24 min)

Smallest new targets: `.tag` 28 px high, `.seg-item` 32 px, `.key` 40 px, Button `sm` 32 px, carousel index keys 24×24. All pass AA. Icon-only buttons stay 40×40.

### 1.5 Motion

Only `.tile-hover` offset (160 ms), seg fill (120 ms), existing `dialog-pop` / `menu-pop`. Remove `hover:-translate-y-px` lifts, `group-hover:rotate-45` arrow spins, `group-hover:scale-[1.04]` image zoom. All motion already collapses under `prefers-reduced-motion` (`styles.css:215-224`).

---

## 2. Shared UI

### 2.1 Button — `src/shared/ui/button.tsx`

**Anatomy:** `[icon?] LABEL [kbd?]` — flat key, mono caps label, 2 px inset bottom edge on filled variants (reads as a physical key, not a pill).

```ts
const base =
  "relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-mono text-[12px] font-medium uppercase tracking-[0.08em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none";
const sizes = { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-5 text-[13px]" };
const primary =
  "bg-inverse text-on-inverse shadow-[inset_0_-2px_0_0_color-mix(in_srgb,var(--on-inverse)_22%,transparent)] hover:bg-accent-hover active:shadow-none active:translate-y-px motion-reduce:active:translate-y-0";
const variants = {
  primary,
  accent: primary,
  outline: "border border-line-strong bg-card text-fg hover:border-fg hover:bg-surface-2 active:bg-surface-2",
  "outline-accent": "border border-fg bg-card text-fg hover:bg-inverse hover:text-on-inverse",
  link: "h-auto px-0 font-sans text-[15px] normal-case tracking-normal font-medium text-fg underline decoration-line-strong decoration-1 underline-offset-4 hover:decoration-fg rounded-[var(--radius-xs)]",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  "ghost-icon": "size-10 rounded-[var(--radius-sm)] border border-transparent text-muted hover:text-fg hover:border-line-strong hover:bg-surface-2 [&_svg]:size-[18px]",
  danger: "bg-danger text-surface hover:opacity-90 shadow-[inset_0_-2px_0_0_rgb(0_0_0/0.2)]",
};
```

| State | Treatment |
|---|---|
| hover | filled: `bg-accent-hover`; outline: border to `fg`, bg `surface-2`. No lift. |
| focus-visible | 2 px `outline-accent`, 2 px offset (unchanged). |
| active | filled: inset edge removed + 1 px down = key press. |
| disabled | `opacity-40`, `cursor-not-allowed`. |
| loading | **Behavior change (a11y fix):** keep children in the DOM so the accessible name survives; overlay the spinner. Render `<span className={loading ? "invisible" : "contents"}>{children}</span>` plus, when loading, `<Loader2Icon className="absolute size-4 animate-spin" aria-hidden />`. Width no longer jumps. `aria-busy` kept. |

Removed: `active:scale-[0.97]`, `hover:-translate-y-px`, `shadow-[var(--shadow-soft|lift)]`.

**Note:** `text-transform: uppercase` does not change DOM text; Testing Library / Playwright names (`"Sign in"`, `"Post note"`, `"Ship it"`, `"Ship now"`, `"Necessary only"`, `"Accept all"`, `"Verify"`, `"Sign up"`) are unaffected.

### 2.2 Avatar — `src/shared/ui/avatar.tsx`

**Anatomy:** square monogram tile. Initials in mono on `surface-2`, inset `line-strong` frame, bottom-right 3 px notch (index-card corner). Photos get the same square crop, grayscale.

```ts
const sizes = {
  xs: "size-5 text-[9px] rounded-[var(--radius-xs)]",
  sm: "size-6 text-[10px] rounded-[var(--radius-xs)]",
  md: "size-8 text-[11px] rounded-[var(--radius-sm)]",
  lg: "size-11 text-sm rounded-[var(--radius-sm)]",
  xl: "size-22 text-2xl rounded-[var(--radius-md)]",
  "2xl": "size-30 text-3xl rounded-[var(--radius-md)]",
};
// Root
"relative inline-flex shrink-0 overflow-hidden bg-surface-2 ring-1 ring-inset ring-line-strong"
// Image
"size-full object-cover grayscale contrast-[1.05]"
// Fallback (replace hueFor(name) + text-white)
"flex size-full items-center justify-center bg-surface-2 font-mono font-medium tracking-tight text-fg after:absolute after:right-0 after:bottom-0 after:size-[3px] after:bg-fg"
```

- `hueFor` stays exported (other files may import it; grep shows it only in `avatar.tsx` today) but is no longer applied. Safe to delete in cleanup.
- Remove `rounded-full` everywhere an Avatar is wrapped (TopBar trigger, skeletons — see their sections).
- a11y: unchanged (`labelled` logic, `aria-label` on fallback when unlabelled).
- **Placement rule (new):** an Avatar is never the first element of a byline row. Bylines are `@handle` mono text; avatars appear only in identity tiles (Profile header, Writer tile, account menu, People list, Composer header).

### 2.3 Modal + Tabs + Lens — `src/shared/ui/modal.tsx`

**Modal anatomy:** tile with header strip. `[● ] TITLE ............ [esc] [×]` then body, then optional footer bar.

```tsx
<Dialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-overlay" />   // drop backdrop-blur: flatter, cheaper
<Dialog.Content className={cn(
  "dialog-pop fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto border border-line-strong bg-card rounded-t-[var(--radius-md)] md:inset-auto md:top-1/2 md:left-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-md)] md:shadow-[4px_4px_0_0_var(--fg)]",
  className)}>
  <div className="tile-head sticky top-0 z-10 justify-between rounded-none md:rounded-t-[calc(var(--radius-md)-1px)]">
    <span className="flex items-center gap-2"><span aria-hidden className="size-1.5 bg-fg" /> <span aria-hidden>Dialog</span></span>
    <span className="flex items-center gap-2"><kbd className="kbd hidden md:inline-grid" aria-hidden>esc</kbd>
      <Dialog.Close asChild><Button variant="ghost-icon" aria-label="Close" className="-mr-2 size-8">…</Button></Dialog.Close></span>
  </div>
  <div className="p-5 md:p-6">
    <Dialog.Title className="font-display text-xl font-bold tracking-[-0.02em]">{title}</Dialog.Title>
    <Dialog.Description …/>   // unchanged
    <div className="mt-5">{children}</div>
  </div>
</Dialog.Content>
```

- Remove the mobile grab-handle pill (`modal.tsx:33`) — the header strip is the handle.
- Hard 4 px offset shadow on desktop is the signature "sheet on a desk" cue. Mobile: none (bottom sheet).
- Title stays `Dialog.Title` (accessible name unchanged). "Dialog" strip text is `aria-hidden`.
- Close button name stays `"Close"`.

**Tabs (`modal.tsx:51`)** — keep `role="tablist"/"tab"`, `aria-selected`, API. Remove the underline `motion.span`. New:

```tsx
<div role="tablist" className="seg">
  <button role="tab" aria-selected={…} className="seg-item shrink-0">{label}</button>
```

Add roving arrow-key handling identical to `Lens.move` (currently missing on Tabs; a11y fix: APG tabs pattern needs Left/Right), and `tabIndex={selected ? 0 : -1}`. e2e uses `getByRole("tab", { name: "Latest" })` / `"Your lists"` — names unchanged.

**Lens (`modal.tsx:93`)** — keep radiogroup + keyboard. Shell `cn("seg", className)`; item `"seg-item"` (drop `aria-checked:bg-card aria-checked:shadow-[var(--shadow-lift)]`). Selected = inverted fill, not a raised white chip. Add optional index prefix: render `<span aria-hidden className="idx text-[10px] opacity-70">{String(i+1).padStart(2,"0")}</span>` before `text`. Accessible name stays `text` because the prefix is aria-hidden (LandingPage test `getByRole("radio", { name: "Newest" })` safe).

### 2.4 States — `src/shared/ui/states.tsx`

**Bone:** `"shimmer rounded-[var(--radius-xs)]"` unchanged.

**PostCardSkeleton** must mirror the new tile (2.6 / 3.1):

```tsx
<div className="tile overflow-hidden">
  <div className="tile-head"><Bone className="h-2.5 w-8" /><Bone className="h-2.5 w-20" /><Bone className="ml-auto h-2.5 w-12" /></div>
  <div className="grid gap-4 p-4 sm:grid-cols-[1fr_9rem]">
    <div className="space-y-2"><Bone className="h-5 w-11/12" /><Bone className="h-5 w-2/3" /><Bone className="h-3.5 w-full" /></div>
    <Bone className="hidden aspect-[4/3] w-full sm:block" />
  </div>
  <div className="flex gap-2 border-t border-line p-2"><Bone className="h-7 w-20" /><Bone className="h-7 w-16" /><Bone className="ml-auto h-7 w-24" /></div>
</div>
```
Remove the round `Bone size-5 rounded-full` (`states.tsx:35`).

**EmptyState anatomy:** dashed tile with status code line.

```tsx
<div className="mx-auto my-10 max-w-md rounded-[var(--radius-md)] border border-dashed border-line-strong bg-card px-6 py-12 text-center">
  <span className="mx-auto grid size-12 place-items-center rounded-[var(--radius-sm)] border border-line-strong hatch"><Icon className="size-5 text-fg" aria-hidden /></span>
  <p className="kicker mt-5" aria-hidden>{code ?? "status · empty"}</p>
  <h2 className="mt-2 font-display text-xl font-bold tracking-[-0.02em]">{title}</h2>
  {body ? <p className="mt-2 text-sm leading-6 text-muted">{body}</p> : null}
  {action ? <div className="mt-6 flex justify-center gap-2">{action}</div> : null}
</div>
```
New optional prop `code?: string`. Call-site values: Feed error → `"err · fetch failed"`, article 5xx → `"err · offline"`, 404 → `"404 · not found"`, 403 → `"403 · no access"`, Following empty → `"0 · circle empty"`, default → `"0 · nothing here"`. aria-hidden, so headings/text tests (`"No stories found."`, etc.) unchanged.

**Loading** unchanged (sr-only "Loading", aria-busy, 150 ms delay).

### 2.5 Form — `src/shared/ui/form.tsx`

**Anatomy: inset-labelled field.** The label sits *inside* the box as a mono caption on top; input below. Not a floating-label animation (that hides the label behind placeholder state and fails when autofilled) — a fixed inset label, which reads as instrument and keeps label visible always.

```
┌ EMAIL OR USERNAME ───────────────┐
│ ada@example.com              [⌫] │
└──────────────────────────────────┘
  ↳ error text / hint
```

```ts
// box wraps label + control
const box = "group/field relative rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 pt-2 pb-1.5 transition-colors focus-within:border-fg focus-within:shadow-[2px_2px_0_0_var(--fg)] has-[[aria-invalid=true]]:border-danger";
const labelCls = "block font-mono text-[10.5px] leading-4 uppercase tracking-[0.1em] text-muted group-focus-within/field:text-fg";
export const inputCls = "h-7 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-muted";
```

- `Field` renders `<div className={box}><label htmlFor={id} className={labelCls}>{label}</label>{children(a)}</div>` then message. Message: error `"mt-1.5 flex items-center gap-1.5 font-mono text-[12px] text-danger"` prefixed with `<span aria-hidden>!</span>`; hint `"mt-1.5 font-mono text-[11px] text-muted"`.
- **`inputCls` contract change:** it is now the bare control inside a `Field` box. Call sites that use `inputCls` *outside* `Field` must use new `export const inputBoxCls = "h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[15px] outline-none focus:border-fg focus:shadow-[2px_2px_0_0_var(--fg)] aria-[invalid=true]:border-danger"`. Grep `inputCls` and switch any non-Field usage. Textareas inside Field: `cn(inputCls, "h-auto min-h-20 py-1 resize-y")`.
- `PasswordInput`: toggle becomes a mono text key `SHOW`/`HIDE` (`"absolute top-1/2 right-0 -translate-y-1/2 h-7 rounded-[var(--radius-xs)] px-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:bg-surface-2 hover:text-fg"`). aria-labels `"Show password"` / `"Hide password"` unchanged. Input `pr-16`.
- `ServerError`: `"flex items-start gap-2 rounded-[var(--radius-sm)] border border-danger bg-card p-3 font-mono text-[12px] text-danger"` with leading `<span aria-hidden>ERR</span>`; `role="alert"` kept.
- a11y: label remains a real `<label for>`, so `getByLabelText("Email or username" | "Password" | "Email" | "Username" | "New password" | …)` all hold. Invalid state not by color alone: error text + `!` glyph.
- Disabled field: `has-[:disabled]:opacity-50 has-[:disabled]:bg-surface-2` on box.

### 2.6 Carousel — `src/shared/ui/carousel.tsx`

**Anatomy:** counter + segmented index + prev/next keys. `[01 / 08]  ▮▯▯▯▯  [‹][›]`.

- `btn`: `"grid size-9 place-items-center rounded-[var(--radius-sm)] border border-line-strong bg-card text-fg transition-colors hover:bg-inverse hover:text-on-inverse disabled:pointer-events-none disabled:opacity-30"` (drop `rounded-full`, `shadow-soft`).
- Dots become index bars, each a 24×24 hit area: `className="grid h-6 w-6 place-items-center"` wrapping `<span aria-hidden className={cn("h-1 w-4 rounded-[1px] transition-colors", active ? "bg-fg" : "bg-line-strong group-hover:bg-muted")} />`. Fixes current 6 px dot target (`carousel.tsx:89`, `h-1.5 w-1.5`), which fails SC 2.5.8 unless spacing exception applies.
- Add counter before bars: `<span className="idx text-[11px]" aria-hidden>{pad(index+1)} / {pad(pages)}</span>`.
- Overlay variant: `"absolute top-3 right-3 z-10 rounded-[var(--radius-sm)] border border-line-strong bg-card py-1 pr-1 pl-2"` (drop `rounded-full`, `bg-card/85 backdrop-blur`).
- Names unchanged: `"Go to slide N"`, `"Previous"`, `"Next"`.
- Slide gap: `pr-3` → `pr-4` to read as separate tiles.

### 2.7 Toast (Sonner) — `src/app/router.tsx:95`

Status-bar style. Change `<Toaster position="bottom-center" />` to (position `top-center` decided in 7.4: nothing fixed lives at the top, so it can't collide with CookieBanner or ReadingDock):

```tsx
<Toaster position="top-center" toastOptions={{ unstyled: true, classNames: {
  toast: "flex w-[min(92vw,380px)] items-center gap-3 rounded-[var(--radius-sm)] border border-line-strong bg-inverse px-3 py-2.5 font-mono text-[12px] text-on-inverse shadow-[3px_3px_0_0_var(--line-strong)]",
  error: "border-danger",
  title: "leading-5",
  icon: "hidden",
}}} />
```
And prefix in `toast.ts`: no API change; the status glyph comes from CSS `before:` — add `toast: "... before:content-['OK'] before:rounded-[2px] before:bg-on-inverse/15 before:px-1 before:text-[10px]"` and `error: "... before:content-['ERR']"`. Sonner still announces through its live region.

---

## 3. Reading context

### 3.1 PostCard — `src/contexts/reading/ui/PostCard.tsx`

Kill the ruled index row. **Bento tile, two layouts chosen by data:**

- **A. Split (has cover):** text left, cover right (`sm:grid-cols-[1fr_11rem]`), cover full-bleed to tile edge.
- **B. Text-only (no cover):** wider excerpt, left `hatch` gutter strip (6 px) as the visual anchor.

```
┌─────────────────────────────────────────────────┐
│ 07 · #DEVOPS             12 MAR 2026 · 4 MIN    │ ← tile-head
├──────────────────────────────┬──────────────────┤
│ Title in display bold, 2–3   │                  │
│ lines max                    │   cover (gray)   │
│ excerpt muted 2 lines        │                  │
│ @handle                      │                  │
├──────────────────────────────┴──────────────────┤
│ [#devops 1] [#k8s]   ▲ 1.2K  ◻ 14      [SAVE][⋯]│ ← action strip
└─────────────────────────────────────────────────┘
```

```tsx
<Reveal as="div" y={10}>
  <article className="tile tile-hover group relative overflow-hidden">
    <header className="tile-head">
      {index !== undefined ? <span className="idx text-fg">{String(index + 1).padStart(2, "0")}</span> : null}
      {post.tags[0] ? <span className="truncate">#{post.tags[0]}</span> : <span>Story</span>}
      <span className="ml-auto flex items-center gap-2 tabular-nums">
        <time dateTime={at}>{shortDate(at)}</time><span aria-hidden>·</span><span>{readTime(post.reading_time)}</span>
      </span>
    </header>
    <div className={cn("grid", cover ? "sm:grid-cols-[1fr_11rem]" : "")}>
      <div className={cn("min-w-0 p-4 md:p-5", !cover && "border-l-[6px] border-l-transparent [border-image:repeating-linear-gradient(-45deg,var(--line)_0_4px,transparent_4px_8px)_1]")}>
        <a href={href} className="block after:absolute after:inset-0 after:z-0">   {/* whole tile clickable */}
          <h2 className="line-clamp-3 font-display text-[19px] leading-6 font-bold tracking-[-0.02em] md:line-clamp-2 md:text-[22px] md:leading-7"><Bio>{post.title}</Bio></h2>
          {text ? <p className="mt-2 line-clamp-2 text-[14px] leading-[22px] text-muted"><Bio>{text}</Bio></p> : null}
        </a>
        <div className="relative z-10 mt-3">{byline}</div>   {/* byline: font-mono text-[12px] text-muted, "@author" — drop "by " */}
      </div>
      {cover ? (
        <div className="relative order-first aspect-[16/9] border-b border-line bg-surface-2 sm:order-none sm:aspect-auto sm:border-b-0 sm:border-l">
          <img … className="absolute inset-0 size-full object-cover grayscale contrast-[1.05]" />
        </div>
      ) : null}
    </div>
    <footer className="relative z-10 flex flex-wrap items-center gap-2 border-t border-line px-2 py-1.5">
      {post.tags.slice(0, 2).map((t) => <Link … className="tag">#{t}</Link>)}
      {post.claps ? <span className="key h-7 cursor-default px-2 hover:bg-transparent"><ZapIcon className="size-3.5" aria-hidden />{compact(post.claps)}<span className="sr-only"> sparks</span></span> : null}
      {post.comments_count ? <span className="key h-7 cursor-default px-2 hover:bg-transparent"><MessageSquareIcon className="size-3.5" aria-hidden />{compact(post.comments_count)}<span className="sr-only"> responses</span></span> : null}
      <div className="ml-auto flex items-center rounded-[var(--radius-sm)] border border-line-strong"><BookmarkButton post={post} compact /><span aria-hidden className="h-6 w-px bg-line" /><PostMenu post={post} /></div>
    </footer>
  </article>
</Reveal>
```

- **New optional prop** `index?: number` — Feed passes its map index. Pinned / other call sites omit it.
- Removed: left 7 rem mono meta column, ArrowUpRight hover badge, cover hover colorize/zoom, `border-b py-6`.
- Stretched-link pattern (`after:absolute after:inset-0`) makes the tile clickable while tags/save/menu sit on `z-10`. Only one link per tile is the title (no duplicate tab stops).
- Image `onError` hides the cover cell → falls back to layout B; keep handler, change target to `closest("[data-cover]")` and add `data-cover` to the cover div.
- `Feed.test.tsx:16` expects text `"1.2K"` — preserved (count still rendered as text).
- Icon change: `MessageCircleIcon` → `MessageSquareIcon` (square speech = less Medium). Decorative only.
- Long-content: title clamps 3/2 lines; tag `max-w-[14rem] truncate`; `@handle` truncates; 2+ tags overflow wraps to second row in footer.
- Byline copy change: `"by @ada"` → `"@ada"`.

### 3.2 Feed — `src/contexts/reading/ui/Feed.tsx`

- List: `<div>` → `<ol className="grid gap-3" aria-label="Stories">` with `<li>` per card; pass `index={i}`. Loading: `<div className="grid gap-3">` around skeletons.
- "Show more": `<Button variant="outline" size="sm">Show more <span className="idx text-[11px]" aria-hidden>+{pageSize}</span></Button>` → keep text "Show more" first so the name starts with it (name becomes "Show more +20" only if not aria-hidden; it is aria-hidden, so name stays "Show more"). If page size isn't on the query result, omit the badge.
- End marker: `<p className="mt-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"><span className="h-px flex-1 bg-line" />EOF · {posts.length} loaded<span className="h-px flex-1 bg-line" /></p>`. **Copy change:** "You're all caught up" → "EOF · N loaded". Grep for the old string in tests before shipping (none found in the test grep).
- Error / empty: pass `code` per 2.4.

### 3.3 TopicChips — `src/contexts/reading/ui/TopicChips.tsx`

- `chip` → `"tag snap-start shrink-0"`; content `<span className="text-muted" aria-hidden>#</span>{t}`. `aria-current="page"` styling handled by `.tag[aria-current]`.
- **Accessible name change:** currently the link name is `"#devops"`; with `#` aria-hidden it becomes `"devops"`. Listed rename. No test queries tag link names (verified in grep above). If you want zero change, drop `aria-hidden` on the `#`.
- Optional counts: add prop `counts?: Record<string, number>`; when present render `<span className="tag-count">{compact(n)}<span className="sr-only"> stories</span></span>`. Sidebar passes counts from `tagsQuery` (it has `t.count`, see `HomePage.tsx:170`).
- Nav wrapper: add a tile-head-style label only when used standalone? No — callers own headings. Keep `nav aria-label="Topics"`.
- Overflow (non-wrap): add right fade `after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-surface` on `nav`.

### 3.4 Sidebar — `src/contexts/reading/ui/Sidebar.tsx`

Replace `divide-y` ruled column + `border-l` with **stacked tiles**.

```tsx
<aside aria-label="Recommendations" className="sticky top-[4.5rem] hidden h-[calc(100dvh-5rem)] space-y-3 overflow-y-auto py-6 [scrollbar-width:none] lg:block">
  <section className="tile" aria-labelledby="sb-rising">
    <h2 id="sb-rising" className="tile-head">Rising <span className="ml-auto idx">24h</span></h2>
    <ol className="divide-y divide-line">
      <li><a href=… className="group grid grid-cols-[2rem_1fr] gap-2 px-3 py-2.5 hover:bg-surface-2">
        <span aria-hidden className="idx pt-0.5 text-[12px] group-hover:text-fg">01</span>
        <span className="min-w-0"><span className="line-clamp-2 font-display text-[14px] leading-5 font-bold">{title}</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">@{author} · {shortDate}</span></span></a></li>
```
- "24h" strip label: **unverified** that trending is a 24 h window — drop it unless `trendingQuery` confirms; otherwise show `top {n}`.
- Topics tile: `tile-head` "Topics" + `<div className="p-3"><TopicChips … wrap counts={…} /></div>`.
- Writers tile: rows `flex items-center gap-3 px-3 py-2.5` with `Avatar size="md"` (square), name `text-sm font-semibold truncate`, `@handle · N readers` mono 11 px, `FollowButton size="sm"`.
- Footer: inside last tile-less row, `font-mono text-[11px] uppercase tracking-[0.12em]`.
- Empty Rising: `"No signal yet."` in `px-3 py-4 font-mono text-[12px] text-muted`. **Copy change** from "Nothing rising yet."
- Loading: bones inside the tile body (same structure).
- Error states currently not handled for any section (`Sidebar.tsx:37` treats error as empty). Draw: error → `"Couldn't load."` + `Button variant="ghost" size="sm"` "Retry" calling `refetch()`. New behavior, small.

---

## 4. Engagement context

### 4.1 Actions — `src/contexts/engagement/ui/actions.tsx`

All three become **keys** (`.key`) so they compose into the ActionDeck (4.2); they keep working standalone.

**BookmarkButton**
- New optional prop `compact?: boolean` (icon-only, used in PostCard footer). Default renders icon + label.
- Full: `<button className={cn("key", className)} aria-pressed={on} aria-label={on ? "Remove from saved" : "Save for later"}>` icon + `<span aria-hidden>{on ? "Saved" : "Save"}</span>`.
- Compact: `className="key size-9 justify-center px-0"`.
- On: icon `BookmarkCheckIcon fill-current text-fg`, label "Saved", plus `aria-pressed` styling (`text-fg`). Spring scale animation kept.
- aria-labels unchanged (`actions.test.tsx` uses "Save for later").

**ClapButton (Spark)**
- `className="key relative"`; content: `ZapIcon size-4`, `<span aria-hidden className="hidden sm:inline">Spark</span>`, count in a well `<span className="tag-count min-w-6 text-center">`.
- Own story: `disabled` (opacity via `.key:disabled`), title kept.
- Maxed: `aria-disabled`, show `MAX` in the well instead of count? No — count must stay visible; append `<span className="idx text-[10px]" aria-hidden>MAX</span>`.
- Burst: rays become 2×2 px squares (`rounded-none`) — on-language.
- aria-label unchanged (`"Spark. N sparks total…"`, tests match `/^Spark/`).

**FollowButton (Track)**
- Default (`outline`): `[+ TRACK]`; on: `[✓ TRACKING]` with `variant="outline"` + `bg-surface-2`. Add leading `PlusIcon size-3.5` when off.
- Hover-on-tracking reveals intent: label swaps to "Untrack" via `group-hover:` (two spans, one `hidden group-hover:inline`), aria-label already "Stop tracking X". Both spans `aria-hidden`; name stays from aria-label.
- `link` variant: keep, but styled per Button `link`.

### 4.2 EngagementBar → "ActionDeck" — `src/app/pages/ArticlePage.tsx:35-78`

**Anatomy:** one segmented, bordered toolbar with labelled keys and counts. Docked (static) at article end; floating copy is a compact horizontal **status bar** at bottom center on all breakpoints (remove the xl left vertical rail — that floating vertical icon column is a Medium "clap rail" echo).

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚡ SPARK [1.2K] │ ◻ DISCUSS [14] │ ⌑ SAVE │ ≡ LIST │ ⧉ COPY LINK │ ⋯ │
└──────────────────────────────────────────────────────────────────────┘
```

```tsx
<div role="toolbar" aria-label="Post actions" data-chrome={sticky ? "" : undefined}
  className={cn("flex items-stretch divide-x divide-line overflow-x-auto rounded-[var(--radius-md)] border border-line-strong bg-card [scrollbar-width:none]",
    sticky ? "sticky bottom-4 z-30 mx-auto mt-10 w-fit max-w-full shadow-[3px_3px_0_0_var(--fg)]" : "mt-12 w-full")}>
  <ClapButton post={post} />
  <button type="button" onClick={onResponses} className="key" aria-label={`Discussion, ${post.comments_count}`}>
    <MessageSquareIcon className="size-4" aria-hidden /><span aria-hidden className="hidden sm:inline">Discuss</span>
    <span aria-hidden className="tag-count">{post.comments_count}</span></button>
  <BookmarkButton post={post} />
  <SaveToList postId={post.id} />            {/* restyle its trigger to className="key" + label "List" */}
  <button type="button" className="key" aria-label="Copy link" …><LinkIcon className="size-4" aria-hidden /><span aria-hidden className="hidden md:inline">Copy link</span></button>
  <PostMenu post={post} />
  {!sticky ? <span className="ml-auto hidden items-center gap-2 px-3 font-mono text-[11px] text-muted md:flex" aria-hidden><kbd className="kbd">S</kbd> spark <kbd className="kbd">D</kbd> discuss</span> : null}
</div>
```

- Keyboard hints: shown only if shortcuts are implemented. **Out of scope** to add shortcuts in this pass → omit the hint span unless the implementer also wires `S`/`D` (would need guards like `SearchBox`'s `/`). Default: omit.
- Toolbar a11y: add roving tabindex (Left/Right) per APG toolbar pattern — currently every button is a tab stop. Optional in this pass; note in Risks.
- Names unchanged: toolbar "Post actions", `/^Spark/`, `/^Discussion/` (aria-label keeps "Discussion, N"), "Copy link", "Save for later".
- Count `0` shows `0` (not empty string) in the Discuss well — explicit zero reads as instrument.
- Mobile ≤ 360 px: labels hidden below `sm`, deck scrolls horizontally; never wraps.

### 4.3 PostMenu — `src/contexts/engagement/ui/PostMenu.tsx`

**Anatomy:** command-list menu with mono section header and leading glyph column.

```ts
const item = "flex cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 h-9 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";
<DropdownMenu.Content align="end" sideOffset={6} className="menu-pop z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[3px_3px_0_0_var(--fg)]">
  <DropdownMenu.Label className="tile-head rounded-none">Tune feed</DropdownMenu.Label>
  <div className="p-1">…items with EyeOffIcon / UserXIcon / HashIcon…</div>
  <DropdownMenu.Separator className="h-px bg-line" />
  <div className="p-1"><DropdownMenu.Item className={cn(item, "text-danger data-[highlighted]:bg-danger data-[highlighted]:text-surface")}><FlagIcon/> Report story…</DropdownMenu.Item></div>
```
- Highlight = inverted row (keyboard-console feel), not gray tint.
- Trigger: `Button variant="ghost-icon"` keeps name `More options for {title}`; in PostCard footer it sits inside the segmented pair (3.1); size `size-9`.
- Long names: "Hide stories by {author}" → `truncate` on a `<span className="min-w-0 truncate">`.
- Copy unchanged.

### 4.4 ReportDialog — `src/contexts/engagement/ui/ReportDialog.tsx`

- Reasons become **selectable option tiles** (radio cards), 2-col on md:
  `label`: `"flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 h-11 text-sm has-[:checked]:border-fg has-[:checked]:bg-inverse has-[:checked]:text-on-inverse has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"`; input stays a native radio but visually `sr-only`; add a leading `idx` `01…`.
- `fieldset`: `grid gap-2 md:grid-cols-2`; legend becomes visible `kicker` "Reason" (was sr-only) — clearer.
- Note field uses new inset `Field`; textarea `cn(inputCls, "h-auto min-h-24 resize-y py-1")`.
- Footer: `flex items-center justify-between border-t border-line pt-4` with `font-mono text-[11px] text-muted` "{n}/1000" counter (watch `note`) and Submit (primary). Name "Submit report" unchanged.

### 4.5 Responses — `src/contexts/engagement/ui/Responses.tsx`

Not a drawer today (inline section) — keep inline; restyle as a **discussion log**.

**Section header:** tile-head-like bar, not a big serif-ish H2 floating:

```tsx
<section … className="scroll-mt-24 pt-4">
  <div className="flex items-center justify-between gap-4 rounded-t-[var(--radius-md)] border border-line-strong bg-surface-2 px-4 h-11">
    <h2 id="discussion-title" className="font-display text-base font-bold tracking-tight">Discussion</h2>
    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted tabular-nums">{count} {count === 1 ? "note" : "notes"} · live</span>
  </div>
  <div className="rounded-b-[var(--radius-md)] border border-t-0 border-line-strong bg-card">
    <div className="border-b border-line p-3"><Composer … /></div>
    …list / states…
  </div>
</section>
```
- "· live" only when `useLiveComments` is connected; **unverified** whether that hook exposes status → if not, omit "· live".
- Heading text "Discussion" kept (`ArticlePage.test.tsx:26`).

**Composer:**
- Signed out: `<button className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-dashed border-line-strong px-3 h-11 font-mono text-[12px] text-muted hover:border-fg hover:text-fg">` "Add a note to the discussion…" + `<span className="kbd" aria-hidden>↵</span>`. Remove `mx-6 w-[calc(100%-3rem)]` hack.
- Signed in: inset box `"rounded-[var(--radius-sm)] border border-line-strong bg-card focus-within:border-fg focus-within:shadow-[2px_2px_0_0_var(--fg)]"`. When open: header row `tile-head rounded-t-[calc(var(--radius-sm)-1px)]` with `Avatar size="xs"` + `@{me.username}` + right `idx` `{text.length}/5000`. Textarea `px-3 py-2`. Footer `flex justify-end gap-2 border-t border-line p-2` with Cancel (ghost) and "Post note" (primary) + `<kbd className="kbd" aria-hidden>⌘↵</kbd>` inside the button.
- **New behavior:** Cmd/Ctrl+Enter submits (textarea `onKeyDown`). Small; if skipped, remove the kbd.
- Name "Post note", textarea labels unchanged.

**Item:**
```
 0001 ┌ [AD] @ada · 3h · edited ─────────────────┐
      │ text                                    │
      │ [▲ 4] [↳ REPLY] [◻ 1 reply] … [✎][🗑]   │
```
- `li` (depth 0): `"grid grid-cols-[3rem_1fr] border-b border-line last:border-b-0"`; left gutter `<span aria-hidden className="idx pt-4 pl-3 text-[11px]">{pad4(n)}</span>` (n = position in tree). Body `"py-4 pr-4"`.
- Header: `Avatar size="sm"` (square) + `font-mono text-[12px]`: `<span className="text-fg font-medium">@{author}</span> · <time>{timeAgo}</time>` + `(edited)` as `tag-count`. Removes name-over-date stacked Medium byline.
- Text: `mt-2 text-[15px] leading-6` (unchanged).
- Actions: `<div className="mt-3 inline-flex divide-x divide-line rounded-[var(--radius-sm)] border border-line-strong">` keys at `h-8`: Like (`ArrowBigUpIcon` + count well; aria-label kept), Replies toggle (text "{n} reply/replies" kept as visible text — `Responses.test.tsx:25` expects name "1 reply"; do **not** add aria-hidden extras inside it), Reply (text "Reply"). Own: Edit / Delete icon keys `size-8` with existing aria-labels ("Edit response", "Delete response"). Others: Report key ("Report response").
- Replies: `ul` `"mt-3 space-y-0 border-l-2 border-dashed border-line-strong pl-4"` — dashed rail, not Medium's 3 px solid quote bar. Depth-1 items: no gutter numbers, `py-3`.
- Editing textarea: inset box classes from Composer; remove `font-serif`.
- Delete confirm: still `confirm()` (unchanged behavior; native dialog). Noted in Risks.
- States: loading → three Bone rows `h-16` inside the log; error → inline row `"flex items-center justify-between p-4 font-mono text-[12px] text-muted"` "ERR · Couldn't load the discussion." + "Try again"; empty → `"p-8 text-center font-mono text-[12px] text-muted"` "0 notes. Start the discussion." (**copy change** from "No notes yet. Start the discussion.").

---

## 5. Identity — AuthDialog `src/contexts/identity/ui/AuthDialog.tsx`

**Split-panel sheet.** Left: inverse "spec panel" (brand, mode, three proof lines). Right: form with segmented mode switch. Desktop 880×560; mobile: full-screen, spec panel collapses to a 56 px inverse header strip.

```
┌──────────────────────┬────────────────────────────────────┐
│ i Blog          v1   │ [ SIGN IN | CREATE ACCOUNT ]   [×] │
│                      │                                    │
│ ACCESS /             │  Welcome back.                     │
│ 01 Track writers     │  ┌ EMAIL OR USERNAME ───────────┐  │
│ 02 Save for later    │  └──────────────────────────────┘  │
│ 03 Spark & discuss   │  ┌ PASSWORD ───────────── SHOW ─┐  │
│                      │  └──────────────────────────────┘  │
│ ░░░ hatch ░░░░░░░░░  │  [ SIGN IN                    → ]  │
│ terms · privacy      │  forgot password?                  │
└──────────────────────┴────────────────────────────────────┘
```

```tsx
<Dialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-overlay" />
<Dialog.Content className="dialog-pop fixed inset-0 z-50 grid grid-rows-[auto_1fr] overflow-y-auto bg-card md:inset-auto md:top-1/2 md:left-1/2 md:h-[560px] md:w-[880px] md:-translate-x-1/2 md:-translate-y-1/2 md:grid-cols-[320px_1fr] md:grid-rows-1 md:overflow-hidden md:rounded-[var(--radius-md)] md:border md:border-line-strong md:shadow-[6px_6px_0_0_var(--fg)]">
  {/* spec panel */}
  <aside aria-hidden className="flex items-center gap-3 bg-inverse px-5 h-14 text-on-inverse md:h-auto md:flex-col md:items-stretch md:justify-between md:p-7">
    <Wordmark className="text-[18px] [&>span:first-child]:bg-on-inverse [&>span:first-child]:text-inverse" />
    <ol className="hidden space-y-3 font-mono text-[12px] md:block">
      <li className="opacity-60 uppercase tracking-[0.12em] text-[11px]">{mode === "signup" ? "New account /" : "Access /"}</li>
      <li><span className="opacity-60">01</span> Track writers you like</li>
      <li><span className="opacity-60">02</span> Save stories for later</li>
      <li><span className="opacity-60">03</span> Spark and join discussions</li>
    </ol>
    <div className="hidden h-24 rounded-[var(--radius-sm)] opacity-20 md:block [background:repeating-linear-gradient(-45deg,var(--on-inverse)_0_1px,transparent_1px_8px)]" />
  </aside>
  {/* form panel */}
  <div className="relative flex flex-col px-6 py-8 md:overflow-y-auto md:px-12 md:py-10">
    <div className="flex items-center justify-between gap-3">
      <div role="radiogroup" aria-label="Account" className="seg">…two radios: Sign in / Create account → authDialog.open(...)</div>
      <Dialog.Close asChild><Button variant="ghost-icon" aria-label={t("auth.close")}>…</Button></Dialog.Close>
    </div>
    <Dialog.Title className="mt-8 font-display text-[26px] leading-8 font-bold tracking-[-0.03em]">{mode === "signup" ? t("auth.join") : t("auth.welcomeBack")}</Dialog.Title>
    <Dialog.Description …sr-only unchanged />
    <div className="mt-6 w-full max-w-[380px]">{form}</div>
    <Agreement />   {/* mt-auto pt-8, font-mono text-[11px] text-muted, max-w-[380px] */}
  </div>
</Dialog.Content>
```

- Spec panel copy is new (3 lines, English hard-coded like other new strings; add i18n keys `auth.spec1..3`, `auth.specAccess`, `auth.specNew` if the implementer wants parity — flagged).
- **Mode switch conflict (important):** the segmented control would expose a radio named "Sign in" while the submit button is also "Sign in". `AuthDialog.test.tsx:20` and e2e `reader.spec.ts:10` use `getByRole("button", { name: "Sign in" })` — a radio is role `radio`, so no collision for role queries. But the e2e step at `reader.spec.ts:7` clicks the **TopBar** "Sign in" button, then line 10 the dialog's — still unique as `button`. Safe. Radios labelled via `t("auth.signIn")` / `t("auth.createOne")`.
- Remove the bottom "Don't have an account? Create one" line (replaced by the segmented switch). **Copy removal** — `t("auth.haveAccount")`, `t("auth.noAccount")` become unused (keep keys).
- Submit buttons: `size="lg" className="w-full justify-between"` with trailing `ArrowRightIcon size-4 aria-hidden`. Names unchanged.
- "Forgot password": `font-mono text-[12px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg` left-aligned under the button.
- MFA step: Field label `t("auth.code")`; input `font-mono text-[20px] tracking-[0.4em] tabular-nums`; add hint "6-digit code from your app" (**unverified** code length — check `mfaInputSchema`; if not fixed 6, use "Code from your authenticator app").
- Turnstile sits in an inset box `rounded-[var(--radius-sm)] border border-line p-2`.
- `Welcome back.` text kept (`reader.spec.ts:57`).
- Focus: Radix traps focus; first field keeps `autoFocus`. The segmented switch is before the title in DOM — acceptable; autofocus lands on the field.
- Spec panel `aria-hidden` (decorative/duplicative). Wordmark there has no link.

---

## 6. Preferences — ReadingPanel `src/contexts/preferences/ui/ReadingPanel.tsx`

**Anatomy: control panel** — rows are `LABEL ............ [control]` with mono labels; steppers show their value; switches become square toggles with ON/OFF text.

- Container: `"divide-y divide-line"` → `"divide-y divide-line rounded-[var(--radius-sm)] border border-line"`; `row` → `"flex items-center justify-between gap-4 px-3 h-12"`; `label` → `"font-mono text-[11px] uppercase tracking-[0.1em] text-muted"`.
- `select`: `"h-9 w-44 rounded-[var(--radius-sm)] border border-line-strong bg-card px-2 font-mono text-[12px] text-fg"`. Labels `Theme`/`Font` stay `<label htmlFor>` (test uses `getByLabelText("Theme"|"Font")`).
- Size / Margin: replace two loose keys with a stepper `seg`: `[ − ] 3/7 [ + ]`:
  ```tsx
  <div className="seg items-center">
    <button className="seg-item w-9 px-0" aria-label="Smaller text" …>A−</button>
    <span className="idx min-w-10 text-center text-[11px]" aria-live="polite">{p.typeStep - TYPE_STEP.min + 1}/{TYPE_STEP.max - TYPE_STEP.min + 1}</span>
    <button className="seg-item w-9 px-0" aria-label="Larger text" …>A+</button>
  </div>
  ```
  Margin buttons keep names "Wider margin" / "Narrower margin". Disabled: `disabled:opacity-40`.
- **Switch:** square track, mono state text.
  ```tsx
  <button role="switch" aria-checked={on} aria-label={name} onClick=…
    className={cn("relative inline-flex h-7 w-14 items-center rounded-[var(--radius-xs)] border border-line-strong font-mono text-[10px] uppercase transition-colors",
      on ? "bg-inverse text-on-inverse" : "bg-surface-2 text-muted")}>
    <span aria-hidden className={cn("absolute top-0.5 size-[22px] rounded-[2px] bg-card border border-line-strong transition-[left]", on ? "left-[calc(100%-24px)]" : "left-0.5")} />
    <span aria-hidden className={cn("w-full", on ? "pl-1.5 text-left" : "pr-1.5 text-right")}>{on ? "On" : "Off"}</span>
  </button>
  ```
  Names unchanged ("Bold text", "Bionic reading", "Focus mode", "Full screen"). State conveyed by position + text, not color alone.
- **Swatches:** `grid-cols-6 gap-1.5`, each `rounded-[var(--radius-xs)]`, selected = `outline-2 outline-fg outline-offset-2` + a 2 px inner corner tick; remove `hover:scale-110`. Note: swatch fills come from palette data (`x.light`, `x.secondary`) — some non-gray palettes (nord, gruvbox, mocha) introduce color. Owner said grayscale only: **decision needed** (see Risks). Spec default: keep, since these are user-chosen reading themes, not chrome.
- **ReadingDock trigger:** `size-12 rounded-[var(--radius-md)] bg-inverse` → keep size, radius `--radius-sm`, add hard shadow `shadow-[3px_3px_0_0_var(--line-strong)]`, remove gear rotate on hover (keep on open). Name "Reading settings" unchanged.
- **Popover:** `"menu-pop z-50 max-h-[80dvh] w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[4px_4px_0_0_var(--fg)]"` (drop `/95` + `backdrop-blur-xl`). Header: `tile-head -mx-0 rounded-t-[…]` "Reading settings" + `<kbd className="kbd ml-auto" aria-hidden>esc</kbd>`; body `p-3`. Footer "Reset to defaults" as `Button variant="ghost" size="sm"` left + right `idx` "prefs · local" (aria-hidden).

---

## 7. App layout

### 7.1 TopBar — `src/app/layout/TopBar.tsx`

**Anatomy:** framed console bar, always bordered (not transparent-until-scroll):

```
┌[i]Blog │ [LATEST|SAVED|TOPICS] │ [⌕ Search stories, topics, writers…   ⌘K] │ ◐ │ [✎ WRITE] [🔔3] [AD▾] ┐
```

- `header`: `"sticky top-0 z-40 h-14 border-b border-line-strong bg-card"`; on scroll add `shadow-[0_2px_0_0_var(--line)]` (no glass). `useScrolled` kept.
- Inner: `"mx-auto flex h-full max-w-shell items-center gap-4 px-4 md:px-6"`; vertical separators `<span aria-hidden className="hidden h-6 w-px bg-line md:block" />` between Logo | nav | search.
- Primary nav: wrap links in `<div className="seg">`; `navLink` → `"seg-item h-7 data-[status=active]:bg-inverse data-[status=active]:text-on-inverse"`. Names unchanged.
- **SearchBox → command field:**
  - Box: `"hidden h-9 w-72 items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-2.5 font-mono text-[12px] text-muted focus-within:border-fg focus-within:bg-card focus-within:shadow-[2px_2px_0_0_var(--fg)] md:flex lg:w-96"` — no width animation.
  - Leading `SearchIcon size-4`; trailing `<kbd className="kbd" aria-hidden>⌘K</kbd>` (show `Ctrl K` on non-Mac via `navigator.platform` check) and existing `/`.
  - **New shortcut:** Cmd/Ctrl+K focuses the input (extend existing keydown handler; `preventDefault` only when meta/ctrl+k). Escape blurs + clears. This is a command *field*, not a full palette — a modal palette with results requires a search-suggest endpoint (not verified to exist) → **out of scope**; field submits to `/search` as today.
  - Placeholder copy: keep `t("nav.search")`; label unchanged.
- Bell: `Button ghost-icon` with border on hover (per 2.1); badge: `"absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-[var(--radius-xs)] bg-inverse px-1 font-mono text-[10px] leading-none text-on-inverse ring-2 ring-card"` (square, not round).
- UserMenu trigger: `"flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-strong pl-0.5 pr-1.5 hover:border-fg data-[state=open]:border-fg"` containing `Avatar size="md"` (square, sized `size-7` via className) + `ChevronDownIcon size-3.5 text-muted`. Name "Account menu" (t key) unchanged.
- Menu content: same as PostMenu 4.3 (inverted highlight, hard shadow). Add `DropdownMenu.Label className="tile-head"`: `@{me.username}`; move the `@username` out of the sign-out row. Add right-aligned `kbd` hints only where shortcuts exist (none today) → none.
- Write link: `Button` primary `size="sm"` look (inline classes from 2.1 primary), icon `PenLineIcon size-4`. Remove `hover:-translate-y-px`.
- Signed out: "Sign in" `ghost`, "Get started" primary. Names unchanged (e2e line 7).
- Height change 64 → 56 px: update `top-16` sticky offsets in `HomePage.tsx:402`, `ProfilePage.tsx:225`, `Sidebar.tsx:24` to `top-14`, and `h-[calc(100dvh-4rem)]` → `h-[calc(100dvh-3.5rem)]`. ArticlePage `scroll-mt-24` OK.

### 7.2 Footer — `src/app/layout/Footer.tsx`

**Anatomy:** status-bar footer + spec grid, not a giant faded wordmark.

- Remove the `text-[clamp(5rem,22vw,18rem)]` "iBlog" block (`Footer.tsx:73-78`) — giant ghost wordmark is decorative fluff.
- Layout: `footer` `"mt-24 border-t border-line-strong bg-card"`; inner `"mx-auto grid max-w-shell gap-px bg-line md:grid-cols-[1.2fr_1fr_1fr]"` with three cells `bg-card p-6`: (1) Wordmark + rights line, (2) `kicker` "Legal" + nav as vertical list, (3) `kicker` "Preferences" + `<Preferences />` stacked.
- Bottom status bar: `"border-t border-line px-4 md:px-6 h-9 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-muted"` → left `"● online"` (`size-1.5 bg-fg` square dot, **only if** there's a connectivity signal; else show build/version if available — **unverified**, default to `"RSS · /api/feed.xml"` link), right `"© {year}"`.
- Preferences selects: `font-mono text-[12px]`, radius sm, `border-line-strong`. Names "Language"/"Theme" (t keys) unchanged; Uzbek "Mavzu" test unaffected.
- Legal names unchanged ("Privacy Policy", "Terms of Use", "Cookie settings").

### 7.3 Logo — `src/app/layout/Logo.tsx`

- Mark: `size-7 rounded-[var(--radius-xs)]` (was sm) + `shadow-[2px_2px_0_0_var(--line-strong)]`; remove `group-hover:rotate-90` → replace with `group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] group-hover:shadow-[3px_3px_0_0_var(--fg)]`.
- Wordmark text: `font-display font-extrabold tracking-[-0.05em]` kept; add trailing `<span aria-hidden className="ml-1 self-start font-mono text-[9px] font-medium tracking-[0.1em] text-muted">BETA</span>` — **only if** the product is in beta (unverified; default omit).
- Link name "iBlog home" unchanged.

### 7.4 CookieBanner — `src/app/layout/CookieBanner.tsx`

Status-bar / system-prompt style docked bottom-left (doesn't overlap ReadingDock bottom-right).

```tsx
<section data-chrome aria-label={t("cookie.title")}
  className="fixed bottom-3 left-3 z-40 w-[min(calc(100vw-1.5rem),420px)] overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[4px_4px_0_0_var(--fg)] md:bottom-6 md:left-6">
  <div className="tile-head rounded-none"><span aria-hidden className="size-1.5 bg-fg" /> <h2 className="font-mono text-[11px]">{t("cookie.title")}</h2><span className="ml-auto idx" aria-hidden>1/1</span></div>
  <p className="p-4 text-[13px] leading-5 text-muted">{body} <Link …underline decoration-line-strong>more</Link></p>
  <div className="grid grid-cols-2 border-t border-line">
    <button className="h-11 font-mono text-[12px] uppercase tracking-[0.08em] text-fg hover:bg-surface-2 border-r border-line">{t("cookie.necessary")}</button>
    <button className="h-11 bg-inverse font-mono text-[12px] uppercase tracking-[0.08em] text-on-inverse hover:bg-accent-hover">{t("cookie.accept")}</button>
  </div>
</section>
```
- Region name "Cookies", buttons "Necessary only" / "Accept all" unchanged. Equal-weight buttons (same size) — better consent UX than a primary-dominant pair; Accept still visually primary.
- Toast position conflict: Sonner moved bottom-left (2.7). Mitigation: Sonner `offset={{ bottom: 24, left: 24 }}` and when banner visible add `mobileOffset`… simpler: put Toaster at `bottom-center` on mobile only, keep bottom-left md+. Pick: `position="bottom-center"` + desktop CSS override is fiddly → **Decision:** Toaster `position="top-center"`. Status bars at the top don't collide with any fixed bottom element. Use that instead of bottom-left in 2.7.

---

## 8. Pages

### 8.1 HomePage — `src/app/pages/HomePage.tsx`

- **Header (`358-394`):** framed "session bar": `"mt-6 grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-line md:grid-cols-[1fr_auto]"` cells `bg-card p-5 md:p-6`. Left: `kicker` date, H1 `text-[28px] md:text-[36px]` (smaller; the 44 px greeting is editorial-magazine). Right cell: actions stacked + mini stat `dl` (`Saved N`) as `font-mono`. Copy unchanged.
- **Spotlight (`47-137`):** lead slide = **cover-as-background bento**: `a` → `"tile tile-hover group relative flex h-full min-h-[380px] flex-col justify-end overflow-hidden"`; image `absolute inset-0 grayscale` + overlay `absolute inset-0 bg-gradient-to-t from-inverse via-inverse/70 to-transparent`; text block `relative p-6 text-on-inverse` (title, excerpt `opacity-80`, meta mono). No cover → `hatch` background, text in `text-fg` (no overlay). Badge `#{i+1} today` → tile-head-style chip `"absolute top-3 left-3 rounded-[var(--radius-xs)] border border-on-inverse/30 bg-inverse px-2 py-1 font-mono text-[11px] uppercase text-on-inverse"`. Remove rotating arrow circle; replace with `"→ READ"` mono text right-aligned. Remove giant first-letter placeholder.
  - Contrast: a 70 % `inverse` scrim over a white photo pixel is about #4d4d4d, so `on-inverse` text on it is only about 7.6:1 in light mode. In dark mode `inverse` is #ededed and the text is dark, so a black photo pixel under the scrim drops to about 4.3:1, which fails. Fix: keep the text in the bottom 45 %, where the scrim is solid or nearly solid. Use `bg-gradient-to-t from-inverse from-35% via-inverse/85 via-55% to-transparent`. Design QA should check this on real covers in both modes.
  - Rising column: `tile` + `tile-head` "Rising"; rows as Sidebar (3.4). Numerals `idx text-[13px]` (not giant `text-line` display numerals — those fail contrast as text at #d4d4d4 on white 1.5:1; they're aria-hidden but still a visual-only cue; switching to `text-muted` fixes it).
- **TopicRail (`139-177`):** tiles → `.tag` with counts, height 32: `className="tag h-8 text-[12.5px]"` + `tag-count`. "All topics →" → `Button variant="ghost" size="sm"` "All topics" + `<kbd className="kbd" aria-hidden>→</kbd>`.
- **Desk panels:** `panel` const → `"tile"`; `panelHead` → `"tile-head"` with the `h2` inside it as text and link right (`ml-auto normal-case tracking-normal font-mono text-[11px] hover:text-fg`); body `p-3`. Saved rows: thumbnails `rounded-[var(--radius-xs)]`, no-cover thumb → `hatch` square. Drafts: add `idx` 01-03 gutter. Writers: square avatars (automatic).
- **Stream (`398-420`):** H2 "The stream" → `kicker`-sized bar? Keep H2 for structure but `text-lg`; sticky lens bar `top-14`, `bg-surface` (drop `/90 backdrop-blur-md` → solid with `border-b border-line`). `StreamCount` → `"idx text-[11px]"` "N stories".
- Loading: Spotlight bones `rounded-[var(--radius-md)]`.

### 8.2 ArticlePage — `src/app/pages/ArticlePage.tsx`

- Kicker (`171`): `"#tag"` → bordered breadcrumb `<nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"><Link to="/">Stream</Link><span aria-hidden>/</span><Link to="/tag/$tag">#{tag}</Link></nav>`. New links; adds 2 tab stops.
- H1: unchanged sizes (display, extrabold) — title is the one editorial moment.
- Meta `dl` (`181-220`): already tile-grid (good, Console-native). Change `rounded-[var(--radius-lg)]` → `--radius-md`, `border-line` → `border-line-strong`, add `idx` prefixes in each `dt` (`01 Writer`, `02 Published`, …) as aria-hidden spans. Writer cell: add `Avatar size="xs"` before `@handle` — allowed here because it's an identity tile, not a byline row.
- Cover: `rounded-[var(--radius-md)] border-line-strong grayscale`; caption strip below `font-mono text-[11px] text-muted` "FIG. 01 — cover" (aria-hidden).
- EngagementBar → ActionDeck (4.2). Remove `sep` const.
- TopicChips at end: wrap in `tile` with `tile-head` "Filed under".
- "About the writer" (`254-273`): identity tile: `"tile grid gap-4 overflow-hidden md:grid-cols-[auto_1fr_auto] md:items-center"` → `tile-head` "Written by" spans full width; body `p-5` with `Avatar size="xl"` (square 88 px), name `font-display text-xl`, `@handle · N readers` mono, bio, actions right. Name/links unchanged.
- Skeleton: `Bone size-11 rounded-full` → `rounded-[var(--radius-sm)]`.
- Error/empty: pass `code` (2.4). Copy unchanged.
- Next up carousel: cards → `tile tile-hover` with `tile-head` `{pad(i+1)} · {readTime}`; body title + `@author`. Numerals no longer `text-line` (contrast, see 8.1).

### 8.3 ProfilePage — `src/app/pages/ProfilePage.tsx`

**Anatomy:** dossier header.

```
┌ PROFILE / @ada ───────────────────────── joined 12 Mar 2024 ┐
│ ┌────┐  Ada Lovelace                         [+ TRACK] [⋯]  │
│ │ AL │  bio…                                                │
│ └────┘                                                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ 01 STORIES 42│ 02 READERS 1.2K │ 03 TRACKING 88 │              │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

- Merge header card + stats into one tile: `"tile overflow-hidden"`; `tile-head` "Profile / @{username}" + right "joined {date}"; body `grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center` with `Avatar size="2xl"` (square 120). H1 `text-[32px] leading-9`. Stats `dl` as bottom row `grid grid-cols-3 gap-px border-t border-line bg-line` cells `bg-card px-4 py-3`, `dt` kicker with idx, `dd` `font-mono text-2xl tabular-nums`. Readers/Tracking buttons keep aria-labels; style `hover:bg-surface-2` on the whole cell (button `w-full text-left`) instead of underline.
- ProfileMenu content: per 4.3. Name "More options" unchanged.
- Section Lens: sticky `top-14`, solid `bg-surface border-b border-line`. Labels unchanged.
- Pinned: `tile-head`-style label above card: `"mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"` + `PinIcon size-3.5`; PostCard without index. Remove `border-b` wrapper.
- People modal rows: `tile`-less list `divide-y divide-line` rows `py-2.5` with square avatars, `@handle` mono under name. "Show more" → `Button variant="outline" size="sm"`.
- Empty lists: `EmptyState` instead of bare `<p>` ("No public lists.", `code="0 · lists"`).
- Loading skeleton: add square `Bone size-30 rounded-[var(--radius-md)]`.
- 404: `code="404 · not found"`.

### 8.4 EditorPage — `src/app/pages/EditorPage.tsx`

- **Top bar (`374-409`):** `h-12 border-b border-line-strong bg-card` (solid). Left: back link (unchanged copy "Stories"), then a `seg`-styled status cell group: `[● SAVED] [312 WORDS] [2 MIN]` — `"inline-flex h-7 divide-x divide-line rounded-[var(--radius-xs)] border border-line-strong font-mono text-[11px] uppercase text-muted [&>span]:px-2 [&>span]:flex [&>span]:items-center [&>span]:gap-1.5"`. `aria-live="polite"` stays only on the status span. "Couldn't save" state: that span `text-danger border-danger`.
- Right: History `ghost-icon`; Preview/Edit as a 2-item `seg` with `aria-pressed` buttons (`seg-item` styles `aria-pressed`) — keep a single toggle button? Keep single button (`aria-pressed`) styled `seg-item` inside a `seg` shell for visual parity — behavior unchanged. Save draft `outline sm`; Ship it primary sm + `<kbd className="kbd border-on-inverse/30 bg-transparent text-on-inverse/70" aria-hidden>⌘S</kbd>` **only if** ⌘S wired (out of scope → omit).
- **Writing surface:** title `font-display text-[40px] leading-[48px]`; subtitle **remove `font-serif`** → `font-sans text-[22px] leading-8 text-muted`; body textarea **remove `font-serif`** → `font-mono text-[16px] leading-7` (Markdown source = code-like, instrument-native; preview shows the serif). Left gutter: `main` gets `md:border-l md:border-line md:pl-8` and a sticky mono label column `"01 TITLE / 02 DEK / 03 BODY"` (aria-hidden) on `lg`.
- Markdown help line → `<p className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] text-muted">` with each syntax as `kbd`.
- Preview: wrap in `tile` with `tile-head` "Preview · rendered".
- **PublishDialog (`96-228`):** right drawer → keep as right sheet (it's a checklist, not comments; acceptable), restyle: `bg-card border-l border-line-strong`, no soft shadow. `step` → `"tile overflow-hidden"`, `stepHead` → `"tile-head"` with `idx` 01–04 + h3 (`text-[11px]` inherits) + right status glyph: `✓` when satisfied (cover set / ≥1 tag / always / time valid) else `—`, aria-hidden, with sr-only "complete"/"optional" text. Body `p-3`.
  - Cover drop zone: `border-dashed border-line-strong hatch` on empty; focus-within outline on label (input is sr-only — add `has-[:focus-visible]:outline-2 …` so keyboard users see focus; current code has no visible focus there — a11y fix).
  - TopicsInput: container → inset field box (2.5 `box`); tokens → `.tag` with remove `×` button `"grid size-5 place-items-center rounded-[2px] hover:bg-inverse hover:text-on-inverse"` (aria-label "Remove {t}" kept — test "Remove go"). Counter `idx` `{n}/5` right.
  - Byline select / datetime: `inputBoxCls`.
  - Footer: sticky bar `bg-card border-t border-line-strong`; button full-width primary; names "Ship now" / "Schedule" unchanged.
- **Revisions modal:** version list → `seg`-like vertical list: buttons `"w-full rounded-[var(--radius-xs)] px-3 py-2 text-left font-mono text-[12px] hover:bg-surface-2 aria-[current=true]:bg-inverse aria-[current=true]:text-on-inverse"` + `aria-current` on selected (a11y: replaces font-weight-only cue). Diff: add line-number gutter, `+` rows `bg-surface-2 font-medium`, `−` rows `text-muted line-through` — **removes `bg-accent/15` and `bg-danger/15`**: `accent` is near-black so `/15` is gray anyway; danger red tint conflicts with grayscale-only. Danger red stays only for destructive/error text.

---

## 9. Accessible-name ledger

**Unchanged (verified against tests):** Sign in, Sign up, Verify, Email or username, Password, Username, Email, Close, Reading settings, Bionic reading, Focus mode, Bold text, Full screen, Larger text, Smaller text, Wider margin, Narrower margin, Theme, Font, Language, Post actions, Spark…, Discussion…, Copy link, Save for later, Remove from saved, Post note, Write a note, Write a reply, Edit response, Delete response, Report response, 1 reply / N replies, More options, More options for {title}, Track/Stop tracking {u}, Ship it, Ship now, Schedule, Save draft, Title, Subtitle, Story body (Markdown), Remove {tag}, Add a topic, Revision history, Necessary only, Accept all, Cookie settings, Cookies (region), iBlog home, Privacy Policy, Terms of Use, Show/Hide password, Go to slide N, Previous, Next, Newest (radio), Account menu, Notifications, Submit report, heading "Discussion", text "Welcome back.", text "1.2K".

**Renamed / new (explicit):**
| Where | Old | New |
|---|---|---|
| TopicChips link | `#devops` | `devops` (if `#` aria-hidden; optional) |
| TopicChips with counts | `#devops` | `devops 12 stories` |
| AuthDialog | — | new radiogroup "Account" with radios "Sign in" / "Create one" (`t("auth.createOne")`) |
| AuthDialog | "Don't have an account? Create one" button | removed |
| ArticlePage | — | new nav "Breadcrumb" with links "Stream", "#{tag}" |
| BookmarkButton (non-compact) | icon only | visible "Save"/"Saved" text is aria-hidden; name unchanged |
| Feed end text | "You're all caught up" | "EOF · N loaded" |
| Responses empty | "No notes yet. Start the discussion." | "0 notes. Start the discussion." |
| Sidebar empty | "Nothing rising yet." | "No signal yet." |
| Byline | "by @ada" | "@ada" |

**Stale e2e (pre-existing, not caused by this spec):** `e2e/reader.spec.ts:40` expects `tab "Latest"` (home now uses Lens radios "Newest"); `:67`/`:70` expect "Publish" / "Publish now" (editor uses "Ship it"/"Ship now"). Flag to QA; unit tests reflect current names.

---

## 10. Implementation order (single pass)

1. `styles.css` §1.2 classes + `--radius-card` remap.
2. `button.tsx`, `avatar.tsx`, `form.tsx` (+ `inputBoxCls`, grep `inputCls` call sites), `modal.tsx`, `states.tsx`, `carousel.tsx`, Toaster in `router.tsx`.
3. `TopicChips`, `PostCard` (+`index`), `Feed`, `Sidebar`.
4. `actions.tsx`, `PostMenu`, `ReportDialog`, `Responses`.
5. `AuthDialog`, `ReadingPanel`.
6. `TopBar` (+ `top-14` offsets), `Footer`, `Logo`, `CookieBanner`.
7. Pages: Home, Article (ActionDeck), Profile, Editor.
8. Run unit tests + `bun run` lint; fix only class/structure regressions.

## 11. Acceptance checklist

- [ ] No `rounded-full` on avatars, buttons, chips, carousel controls, badges (grep `rounded-full` in the listed files: only Switch knob history and spinners may remain — Switch is now square too).
- [ ] No `rounded-[var(--radius-lg)]` / `--radius-xl` in listed files.
- [ ] No `shadow-[var(--shadow-soft)]` / `--shadow-lift` / `backdrop-blur` in listed files except none.
- [ ] No `font-serif` outside `.prose-article`.
- [ ] No underline indicator in `Tabs`.
- [ ] Every PostCard is a `.tile` with `tile-head`.
- [ ] Article actions render as one bordered toolbar with visible labels ≥ `sm`.
- [ ] Auth is split-panel on md+.
- [ ] All names in §9 "Unchanged" still resolve (unit tests green).
- [ ] Keyboard: Tabs and Lens arrow-navigable; ⌘K/Ctrl+K and `/` focus search; focus ring visible on cover drop zone.
- [ ] Light + dark checked for every component (tokens swap; hard shadows use `var(--fg)` so they invert correctly).
