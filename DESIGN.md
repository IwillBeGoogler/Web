# DESIGN.md — iBlog (public reading site)

> 2026-10 identity refresh: warm paper `#f7f6f2` / ink `#0b0b0f`, violet accent `#5b3df5` / `#a495ff`, fonts Bricolage Grotesque (display, `font-display`), Geist (UI), Instrument Serif (italic accents, `font-italic`). Cards use `.panel` (`--card` token), buttons `rounded-xl`, pill segmented tabs, floating nav, settings dock (`ReadingDock`) mounted on every route. Values below that conflict are superseded.

Stack: React 19, Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config.js`), `@tailwindcss/typography`, `lucide-react`, Radix primitives (Dialog, DropdownMenu, Tabs, Toast, Avatar, Popover).
Rule: components use only the tokens below (`bg-surface`, `text-fg`, `text-muted`, `border-line`, `bg-accent` …). No raw hex in JSX.

## 1. Tokens — `src/styles.css`

Add to `index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,700;1,8..60,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
```

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-serif: "Source Serif 4", Georgia, Cambria, "Times New Roman", serif;
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Menlo, monospace;

  /* semantic colors -> resolve to runtime vars so .dark can swap them */
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-subtle: var(--subtle);        /* decorative only, never text */
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);  /* chips, skeletons, hover */
  --color-line: var(--line);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-on-accent: var(--on-accent);
  --color-inverse: var(--inverse);      /* black pill bg */
  --color-on-inverse: var(--on-inverse);
  --color-danger: var(--danger);
  --color-overlay: var(--overlay);

  --breakpoint-sm: 40rem;  /* 640 */
  --breakpoint-md: 48rem;  /* 768 */
  --breakpoint-lg: 64rem;  /* 1024 */
  --breakpoint-xl: 80rem;  /* 1280 */

  --container-feed: 42.5rem;    /* 680 */
  --container-sidebar: 20rem;   /* 320 */
  --container-shell: 84rem;     /* 1344 */

  --animate-clap-bubble: clap-bubble 600ms ease-out forwards;
  --animate-clap-pop: clap-pop 200ms ease-out;
  @keyframes clap-bubble {
    0%   { opacity: 0; transform: translate(-50%, 0) scale(.8); }
    20%  { opacity: 1; transform: translate(-50%, -16px) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -32px) scale(1); }
  }
  @keyframes clap-pop { 50% { transform: scale(1.15); } }
}

:root {
  --fg: #242424;          /* 15.9:1 on white */
  --muted: #6b6b6b;       /* 5.3:1 on white */
  --subtle: #d9d9d9;
  --surface: #ffffff;
  --surface-2: #f2f2f2;
  --line: #e6e6e6;
  --accent: #1a8917;      /* 4.55:1 vs white, both directions */
  --accent-hover: #156d12;
  --on-accent: #ffffff;
  --inverse: #191919;
  --on-inverse: #ffffff;
  --danger: #c62828;      /* 5.6:1 on white */
  --overlay: rgb(0 0 0 / .45);
  color-scheme: light;
}
.dark {
  --fg: #e6e6e6;          /* 14.6:1 on #121212 */
  --muted: #a8a8a8;       /* 7.9:1 */
  --subtle: #3a3a3a;
  --surface: #121212;
  --surface-2: #1f1f1f;
  --line: #2e2e2e;
  --accent: #3fb03b;      /* 6.7:1 on #121212 */
  --accent-hover: #52c24e;
  --on-accent: #121212;   /* dark text on light green */
  --inverse: #f2f2f2;
  --on-inverse: #121212;
  --danger: #ff6b6b;
  --overlay: rgb(0 0 0 / .65);
  color-scheme: dark;
}

@layer base {
  html { @apply bg-surface text-fg font-sans antialiased; }
  :focus-visible { @apply outline-2 outline-offset-2 outline-accent; }
  ::selection { background: color-mix(in srgb, var(--accent) 25%, transparent); }
}

@layer components {
  .prose-article {
    @apply prose max-w-none font-serif text-fg;
    --tw-prose-body: var(--fg);
    --tw-prose-headings: var(--fg);
    --tw-prose-links: var(--fg);
    --tw-prose-quotes: var(--fg);
    --tw-prose-quote-borders: var(--fg);
    --tw-prose-code: var(--fg);
    --tw-prose-pre-bg: var(--surface-2);
    --tw-prose-pre-code: var(--fg);
    --tw-prose-hr: var(--line);
    --tw-prose-captions: var(--muted);
    --tw-prose-bullets: var(--fg);
    --tw-prose-counters: var(--fg);
    font-size: 1.125rem; line-height: 1.75rem;            /* 18/28 mobile */
    letter-spacing: -0.003em;
  }
  @media (width >= 48rem) {
    .prose-article { font-size: 1.25rem; line-height: 2rem; } /* 20/32 */
  }
  .prose-article :where(p) { margin-top: 2em; margin-bottom: 0; }
  .prose-article :where(p:first-child) { margin-top: 0; }
  .prose-article :where(h2) { @apply font-sans font-bold; font-size: 1.5rem; line-height: 1.25; margin: 1.6em 0 0; letter-spacing: -0.016em; }
  .prose-article :where(h3) { @apply font-sans font-bold; font-size: 1.25rem; line-height: 1.3; margin: 1.4em 0 0; }
  .prose-article :where(a) { text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
  .prose-article :where(a:hover) { @apply text-accent; }
  .prose-article :where(blockquote) { @apply border-l-[3px] pl-5 italic font-normal; quotes: none; }
  .prose-article :where(blockquote p::before, blockquote p::after) { content: none; }
  .prose-article :where(:not(pre) > code) { @apply font-mono bg-surface-2 rounded px-1 py-0.5; font-size: .85em; }
  .prose-article :where(:not(pre) > code)::before,
  .prose-article :where(:not(pre) > code)::after { content: none; }
  .prose-article :where(pre) { @apply font-mono rounded-sm p-5 overflow-x-auto; font-size: .875rem; line-height: 1.6; }
  .prose-article :where(img) { @apply mx-auto my-10 w-full h-auto; }
  .prose-article :where(figcaption) { @apply text-center font-sans text-sm; }
  .prose-article :where(hr) { @apply border-0 text-center my-10; }
  .prose-article :where(hr)::after { content: "· · ·"; @apply text-muted tracking-[1em] text-2xl; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
}
```

No new tokens beyond these. Dark mode toggled by adding `.dark` on `<html>` (persist in `localStorage`, default to `prefers-color-scheme`).

## 2. Layout

| Breakpoint | Gutter | Feed | Sidebar | Article |
|---|---|---|---|---|
| < 768 | 16px (`px-4`) | full width | hidden | full width |
| 768–1023 | 24px (`md:px-6`) | max 680, centered | hidden | max 680 |
| ≥ 1024 | 24px | 680 | 320, sticky, left border | max 680 |

- App shell: `min-h-dvh bg-surface text-fg`
- Home grid: `mx-auto max-w-shell px-4 md:px-6 lg:grid lg:grid-cols-[minmax(0,var(--container-feed))_var(--container-sidebar)] lg:justify-center lg:gap-16 xl:gap-24`
- Feed column: `min-w-0 max-w-feed mx-auto lg:mx-0 py-6`
- Sidebar: `hidden lg:block border-l border-line pl-10 py-8 sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto`
- Article page: `mx-auto max-w-feed px-4 md:px-6 pt-8 md:pt-12 pb-24`

### TopBar (sticky, 56px)
- `<header class="sticky top-0 z-40 h-14 bg-surface/95 backdrop-blur border-b border-line">`
- Inner: `mx-auto max-w-shell h-full px-4 md:px-6 flex items-center gap-4`
- Left: wordmark `<a class="font-serif text-[28px] font-bold tracking-tight text-fg" aria-label="iBlog home">iBlog</a>`
- Search pill (≥ md): `hidden md:flex items-center gap-2 h-10 w-60 rounded-full bg-surface-2 px-4 text-sm text-muted` with `Search` icon (20px) + `<input class="bg-transparent outline-none placeholder:text-muted w-full" placeholder="Search" aria-label="Search">`. Mobile: ghost icon button `Search` opening `/search`.
- Right (`ml-auto flex items-center gap-2 md:gap-6`), signed in:
  - Write: `hidden md:flex items-center gap-2 text-sm text-muted hover:text-fg` + `SquarePen` 20px, text "Write"
  - Bell: ghost icon button `Bell`, `aria-label="Notifications"`; unread dot `absolute top-2 right-2 size-2 rounded-full bg-accent`
  - Avatar 32px → Radix DropdownMenu (Profile, Library, Stories, Settings, separator, Sign out)
- Signed out: `<a class="text-sm text-fg hover:underline">Sign in</a>` + `Button variant="primary" size="sm"` "Get started" (both open AuthDialog).

## 3. Components

### Button
Base: `inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:pointer-events-none`

| size | classes |
|---|---|
| sm | `h-9 px-4 text-sm` (36px) |
| md | `h-10 px-5 text-sm` |
| lg | `h-11 px-6 text-base` (auth, publish) |

| variant | classes |
|---|---|
| primary | `bg-inverse text-on-inverse hover:opacity-85` |
| accent | `bg-accent text-on-accent hover:bg-accent-hover` |
| outline | `border border-fg text-fg bg-transparent hover:bg-surface-2` |
| outline-accent (Follow on article) | `border border-accent text-accent hover:bg-accent hover:text-on-accent` |
| link | `h-auto px-0 text-accent hover:underline rounded-none` |
| ghost-icon | `size-10 rounded-full text-muted hover:text-fg hover:bg-surface-2` (40px target, icon 24px, `strokeWidth={1.5}`) |

Loading: replace label with `Loader2 className="size-4 animate-spin"` + keep width (`aria-busy="true"`). Icon-only buttons must pass `aria-label`.

### Avatar
Radix Avatar. Sizes: `xs=20 sm=24 md=32 lg=44 xl=88 2xl=120` via `size-5/6/8/11/22/30`.
- Root: `relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-2`
- Image: `size-full object-cover`, `alt=""` when name is printed next to it, else `alt={name}`.
- Fallback: initials (first letters of first two words, uppercase, max 2) `flex size-full items-center justify-center font-sans font-semibold text-white` with `text-[0.4em]`-scaled size (`xs:text-[9px] sm:text-[10px] md:text-xs lg:text-base xl:text-3xl`). Background from 8-color palette indexed by `hash(userId) % 8`: `bg-[#1a8917] bg-[#0f6e9e] bg-[#7b4bb7] bg-[#b4441c] bg-[#a6326b] bg-[#3d5a80] bg-[#6b5b16] bg-[#2f6f5e]` — each ≥ 4.5:1 with white. **New tokens flagged:** these 8 avatar hues are not in the theme; add as `--color-avatar-1..8` if reused elsewhere.

### PostCard
```
<article class="group py-6 border-b border-line">
  <div class="flex items-center gap-2 text-[13px] text-fg">
    <Avatar size="xs"/> <a class="font-medium hover:underline truncate max-w-[60%]">{author}</a>
    {publication && <span class="text-muted">in</span> <a class="font-medium hover:underline truncate">{pub}</a>}
  </div>
  <div class="mt-3 flex gap-6 md:gap-14">
    <a href={url} class="min-w-0 flex-1">
      <h2 class="font-sans font-bold text-base md:text-[22px] leading-6 md:leading-7 tracking-tight line-clamp-3 md:line-clamp-2">{title}</h2>
      <p class="mt-2 hidden sm:block font-serif text-base leading-6 text-muted line-clamp-2">{excerpt}</p>
    </a>
    {thumb && <img class="shrink-0 w-20 h-14 md:size-28 rounded-sm object-cover bg-surface-2" alt="" loading="lazy"/>}
  </div>
  <div class="mt-4 flex items-center gap-4 text-[13px] text-muted">
    {staffPick && <Sparkles class="size-4 text-[#ffc017]" aria-label="Staff pick"/>}
    <time dateTime>{"Mar 4"}</time><span aria-hidden>·</span><span>{"6 min read"}</span>
    <span class="flex items-center gap-1"><Hand class="size-4"/>{"1.2K"}<span class="sr-only"> claps</span></span>
    <span class="flex items-center gap-1"><MessageCircle class="size-4"/>{"34"}<span class="sr-only"> responses</span></span>
    <div class="ml-auto flex items-center gap-1 md:mr-[8.5rem]">  <!-- align under text column, not thumb -->
      <Button variant="ghost-icon" aria-label="Save" aria-pressed={saved}><Bookmark|BookmarkCheck class="size-5"/></Button>
      <Button variant="ghost-icon" aria-label="More"><MoreHorizontal class="size-5"/></Button>
    </div>
  </div>
</article>
```
- Counts: `0` hidden; ≥1000 → `1.2K`; ≥1e6 → `1.2M`. Read time: `max(1, ceil(words/265))`.
- Worst cases: 140-char title clamps at 2 lines desktop/3 mobile; 40-char author truncates; no thumb → text takes full width; no excerpt → title only. `#ffc017` star is decorative (aria-label carries meaning) — **flagged new token** `--color-star`.

### FeedTabs
Radix Tabs, sticky under top bar: `sticky top-14 z-30 bg-surface border-b border-line`.
- List: `flex gap-8 overflow-x-auto [scrollbar-width:none]`, leading `+` ghost-icon (aria-label "Discover topics").
- Trigger: `relative h-12 shrink-0 text-sm text-muted hover:text-fg data-[state=active]:text-fg data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-px data-[state=active]:after:bg-fg`
- Tabs: `For you`, `Following`, `Latest`. "Following" signed out → opens AuthDialog instead of switching.

### TopicChips
`<nav aria-label="Topics" class="relative">` + list `flex gap-2 overflow-x-auto py-4 scroll-px-4 [scrollbar-width:none] snap-x`
- Chip: `snap-start shrink-0 h-9 px-4 rounded-full bg-surface-2 text-sm text-fg hover:bg-line aria-[current=page]:bg-inverse aria-[current=page]:text-on-inverse`
- Edge fades (desktop): `pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface` + chevron ghost-icon scroll buttons, shown only when scrollable.

### Sidebar
Sections stacked `space-y-10`. Section title: `font-sans text-base font-semibold text-fg mb-4`. "See the full list" link: `mt-4 text-sm text-accent hover:underline`.
1. **Staff picks** (3 items): each `space-y-1`: author row (Avatar xs + `text-[13px] font-medium`), title `font-sans font-bold text-base leading-5 line-clamp-2 hover:underline`, date `text-[13px] text-muted`.
2. **Recommended topics**: TopicChips with `flex-wrap`, max 7, then "See more topics".
3. **Who to follow** (3): `flex items-start gap-4`; Avatar md; text `min-w-0 flex-1` name `text-base font-bold truncate`, bio `text-[13px] text-muted line-clamp-2`; `Button variant="outline" size="sm"` "Follow" → "Following" (`aria-pressed`).
4. Footer links: `flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-muted` (Help, Status, About, Privacy, Terms).

### ArticleHeader
```
<header>
  <h1 class="font-sans font-bold text-[32px] leading-10 md:text-[42px] md:leading-[52px] tracking-[-0.016em] text-fg text-balance">
  <h2 class="mt-3 font-sans text-xl md:text-[22px] leading-7 text-muted">{subtitle}</h2>
  <div class="mt-8 flex items-center gap-3">
    <Avatar size="lg"/>   <!-- 44px -->
    <div class="text-sm leading-5 min-w-0">
      <div class="flex items-center gap-2"><a class="text-base font-medium text-fg hover:underline truncate">{name}</a>
        <span aria-hidden class="text-muted">·</span><Button variant="link" class="text-base">Follow</Button></div>
      <div class="text-muted">{"4 min read"} <span aria-hidden>·</span> <time>{"Oct 5, 2026"}</time></div>
    </div>
  </div>
</header>
<EngagementBar class="mt-8"/>
<img cover class="mt-10 w-full h-auto" />  <div class="prose-article mt-10">…</div>
```
Followed state: "Following" in `text-muted`. Own post: replace Follow with "Edit" link.

### EngagementBar
`<div role="toolbar" aria-label="Post actions" class="flex items-center justify-between h-12 border-y border-line px-2 text-sm text-muted">`
- Left `flex items-center gap-5`: `ClapButton`, comments `<button class="flex items-center gap-1.5 h-10 hover:text-fg" aria-label="Responses, 34"><MessageCircle class="size-6" strokeWidth={1.5}/>34</button>`
- Right `flex items-center gap-2`: ghost-icon `Bookmark` (`aria-pressed`), ghost-icon `Share` → Popover: Copy link (toast "Link copied"), X, LinkedIn, Facebook.
- Rendered at top (under header) and at bottom (after tags row). Bottom also shows tags as TopicChips (`flex-wrap`).

### ClapButton
- `<button class="relative flex items-center gap-1.5 h-10 hover:text-fg" aria-label="Clap. 1,204 claps total, you clapped 3">`
- Icon `Hand` `size-6 strokeWidth={1.5}`; when user claps > 0: `fill-current text-fg` and `animate-clap-pop` on each click.
- Bubble: `pointer-events-none absolute left-3 -top-6 rounded-full bg-inverse text-on-inverse text-xs font-medium size-8 grid place-items-center animate-clap-bubble` text `+{userClaps}`; re-key per click to restart.
- Rules: max 50 per user per post; at 50 bubble shows `+50` and button `aria-disabled`. Debounce network 800ms, send cumulative delta; optimistic, rollback + error toast on failure. Signed out → AuthDialog. Holding (pointerdown 400ms) repeats every 150ms. Own post: disabled, tooltip "You can't clap for your own story".

### Responses
Radix Dialog as right drawer (≥ md) / full-screen sheet (< md):
- Overlay `fixed inset-0 bg-overlay`; Content `fixed inset-y-0 right-0 z-50 w-full md:w-[414px] bg-surface shadow-2xl overflow-y-auto data-[state=open]:animate-in slide-in-from-right` (fallback: no slide under reduced motion).
- Header `sticky top-0 bg-surface flex items-center justify-between px-6 h-16`: `<Dialog.Title class="text-xl font-bold">Responses (34)</Dialog.Title>` + ghost-icon `X` aria-label "Close".
- Composer: `mx-6 rounded border border-line shadow-sm p-4`; collapsed placeholder "What are your thoughts?"; expanded: avatar+name row, `<textarea class="w-full min-h-24 resize-none bg-transparent font-serif text-base outline-none" aria-label="Write a response">`, footer `flex justify-end gap-2`: ghost "Cancel", accent sm "Respond" (disabled when empty; 5000-char cap with counter `text-xs text-muted` from 4500).
- Sort select: "Most relevant / Most recent" `text-sm`.
- **Comment item**: `px-6 py-6 border-b border-line`; row Avatar md + `text-sm font-medium` name + `text-sm text-muted` relative time; body `mt-3 font-serif text-base leading-6 whitespace-pre-wrap break-words`; actions `mt-3 flex items-center gap-4 text-sm text-muted`: mini clap (`Hand size-5` + count), `"{n} replies"` toggle (`MessageCircle`), "Reply" link `ml-auto text-fg hover:underline`; own comment: `MoreHorizontal` menu (Edit, Delete → confirm dialog).
- **Replies**: `ml-4 pl-4 border-l-[3px] border-line` nested one level only; deeper replies flatten with "@name" prefix. Reply composer inline, same as composer.
- States: loading = 3 comment skeletons; empty = "There are currently no responses for this story. Be the first to respond." `text-sm text-muted text-center py-12`; error = "Couldn't load responses." + outline sm "Try again". Deleted with replies → body "This response was deleted." `italic text-muted`.

### ProfileHeader
Profile layout uses home grid; main column:
- Name: `font-sans font-bold text-[32px] md:text-[42px] leading-tight tracking-tight pt-10 md:pt-14 break-words`
- Mobile only (sidebar hidden): `flex items-center gap-4 mt-4` Avatar xl + `text-muted` "12.4K followers" + Follow.
- Tabs (same FeedTabs style) `mt-8`: `Home`, `About`. (`Lists` out of scope.)
- Sidebar (lg): Avatar 2xl, name `mt-4 font-medium`, `text-muted` "12.4K followers" link, bio `mt-3 text-sm text-muted`, `mt-6` Follow `Button variant="accent" size="md"` / Following = `outline`; own profile → link "Edit profile" `text-sm text-accent`.
- About tab: bio as `prose-article`, "Member since Mar 2024" `text-sm text-muted`, followers/following counts `text-accent`.
- Empty Home: "{name} hasn't published any stories yet."

### Editor (`/new-story`, `/p/:id/edit`)
- Top bar (replaces TopBar): `h-14 border-b border-transparent` inner `mx-auto max-w-[1040px] px-4 flex items-center gap-3`: wordmark, `text-sm text-muted` status "Draft" → "Saving…" → "Saved" (`aria-live="polite"`), `ml-auto` accent sm "Publish" (disabled until title non-empty AND body ≥ 1 char), ghost-icon `MoreHorizontal`, Avatar md.
- Body `mx-auto max-w-feed px-4 pt-10`:
  - Title `<textarea rows=1 auto-grow class="w-full resize-none bg-transparent font-serif text-[42px] leading-[52px] font-normal outline-none placeholder:text-subtle" placeholder="Title" aria-label="Title" maxlength="100">`
  - Subtitle `… font-serif text-[28px] leading-9 text-muted placeholder:text-subtle mt-2` placeholder "Subtitle (optional)", maxlength 140.
  - Body `<textarea class="mt-6 w-full min-h-[60vh] resize-none bg-transparent font-serif text-xl leading-8 outline-none placeholder:text-subtle" placeholder="Tell your story…" aria-label="Story body (Markdown)">`
  - Note: `--subtle` placeholders are below 4.5:1 by design; `aria-label` carries the name. If AA for placeholders is required, use `placeholder:text-muted` instead.
  - Toggle "Preview" ghost button switches body to rendered `prose-article`.
- Autosave every 2s idle; leave-page guard if unsaved. Save failure → status "Couldn't save" `text-danger` + retry.
- **Publish dialog** (Radix Dialog, full-screen < md, `max-w-[880px] rounded-none md:rounded md:p-12` ≥ md, two columns `md:grid md:grid-cols-2 md:gap-12`):
  - Left "Story Preview": cover dropzone `aspect-[16/9] bg-surface-2 rounded flex flex-col items-center justify-center text-sm text-muted text-center p-6 border border-dashed border-line` text "Include a high-quality image in your story to make it more inviting to readers." + `<input type=file accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only">` wrapped in label; ≤ 5 MB, else inline error `text-danger text-sm`. Uploaded: image `object-cover` + ghost-icon `X` "Remove cover". Preview title/subtitle inputs `border-b border-line font-sans font-bold` editable.
  - Right: "Publishing to: **{name}**", "Add or change topics (up to 5) so readers know what your story is about", topics combobox: `min-h-12 flex flex-wrap gap-2 rounded border border-line bg-surface-2 p-2`, entered topics as chips with `X` (aria-label "Remove {topic}"), input `flex-1 min-w-24 bg-transparent outline-none text-sm` placeholder "Add a topic…", Enter/comma commits, Backspace removes last, 6th blocked with hint. Buttons: accent md "Publish now" (loading state), link "Schedule for later" out of scope.
  - Success → navigate to post, toast "Your story is published".

### AuthDialog
Radix Dialog: overlay `fixed inset-0 bg-overlay`, content `fixed inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[678px] md:min-h-[600px] bg-surface md:rounded md:shadow-2xl flex flex-col items-center justify-center px-6 md:px-14 py-14 text-center`.
- Close ghost-icon `absolute top-4 right-4`.
- Title `font-serif text-[28px] leading-8` — "Welcome back." (sign in) / "Join iBlog." (sign up).
- Form `mt-12 w-full max-w-[300px] space-y-4 text-left`:
  - Label `block text-sm text-fg mb-1`; Input `h-11 w-full rounded border border-line bg-surface-2 px-3 text-base outline-none focus:border-fg aria-[invalid=true]:border-danger`.
  - Sign up: Name, Email, Password (min 8, show/hide ghost-icon `Eye`/`EyeOff`). Sign in: Email, Password.
  - Error `text-sm text-danger` linked via `aria-describedby`; server error banner above form `role="alert"`.
  - Submit `Button variant="primary" size="lg" class="w-full"` "Sign in" / "Sign up".
- Switch: `mt-10 text-sm` "No account? **Create one**" / "Already have an account? **Sign in**" (`text-accent font-bold`).
- Legal `mt-10 text-[13px] text-muted max-w-[400px]`.

### Skeletons
Block: `animate-pulse rounded bg-surface-2` (`motion-reduce:animate-none`). Container `aria-busy="true" aria-live="polite"` + `<span class="sr-only">Loading</span>`.
- PostCard: avatar `size-5 rounded-full`, line `h-3 w-32`, title `h-6 w-11/12` + `h-6 w-2/3`, excerpt `h-4 w-full` ×2, meta `h-3 w-40`, thumb `w-20 h-14 md:size-28`. Show 4 cards.
- Article: title 2 bars `h-10`, avatar row, then 8 `h-5` lines varying width.
- Show skeletons only after 150ms to avoid flash.

### Empty / error states
Wrapper `py-20 text-center max-w-sm mx-auto`; icon `size-10 text-muted mx-auto` (lucide); heading `mt-4 font-sans text-xl font-bold`; body `mt-2 text-sm text-muted`; optional CTA Button below `mt-6`.
| Case | Copy |
|---|---|
| Following feed empty | "Stories from writers you follow will appear here." CTA outline "Find writers to follow" |
| Search no results | "Make sure all words are spelled correctly." |
| Feed error | "Something went wrong loading stories." CTA outline "Try again" |
| Post 404 | "This story doesn't exist or was removed." CTA primary "Back to home" |
| Draft of other user (403) | "You don't have access to this story." |
| Offline | toast (below) |

### Toasts
Radix Toast; viewport `fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm`. Toast: `flex items-center gap-3 rounded bg-inverse text-on-inverse px-4 py-3 text-sm shadow-lg`; optional action `ml-auto font-semibold underline`. Duration 4s (errors 6s, with "Retry"). Error toasts use `type="foreground"` (assertive). Max 3 visible.

## 4. Accessibility
- Focus: global `:focus-visible` 2px `outline-accent` offset 2px; never `outline-none` without a replacement. Inputs use border change plus outline.
- Contrast (computed WCAG ratios): fg/surface 15.9:1, muted/surface 5.3:1, accent/white 4.55:1, white/accent 4.55:1; dark: fg 14.6:1, muted 7.9:1, accent 6.7:1. `--subtle` is decorative/placeholder only.
- Targets: all interactive ≥ 24×24 (WCAG 2.2 SC 2.5.8); icon buttons are 40×40. Meta-row inline counts are non-interactive.
- Every icon-only button has `aria-label`; toggles use `aria-pressed` (Save, Follow, Clap state via label); lucide icons `aria-hidden="true"` when labelled by parent.
- Landmarks: `<header>`, `<main id="main">`, `<aside aria-label="Recommendations">`, `<nav aria-label="Feed">`. First focusable: "Skip to content" `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-4 focus:py-2`.
- One `<h1>` per page (article title / profile name / feed: visually hidden "Home").
- Dialogs: Radix focus trap + Esc + return focus; each has `Dialog.Title`.
- Live regions: save status, clap count updates (`aria-live="polite"`, throttled), toasts.
- Reduced motion: global override in CSS; ClapButton skips bubble & pop, count updates only; drawer appears without slide.
- `lang` on `<html>`; article `lang` from post metadata if non-English.

## 5. Out of scope
Lists/collections, publications pages, membership paywall, stats dashboard, rich-text (WYSIWYG) editor, highlights/inline notes, scheduled publishing.
