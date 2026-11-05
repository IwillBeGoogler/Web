# REDESIGN-2 — De-Medium pass + Home "Reading Desk"

Scope: client only, grayscale tokens only (`bg-surface`, `bg-surface-2`, `bg-card`, `border-line`, `border-line-strong`, `text-fg`, `text-muted`, `bg-inverse`/`text-on-inverse`, `font-display`, `font-mono`, `.kicker`, `--radius-xs..xl`, `--shadow-lift`). No new colors. No pink: `--grad-brand` is already `#0a0a0a → #404040 → #737373` (styles.css:297-307), keep it.

Audited 2026-10-06 against: HomePage.tsx, LandingPage.tsx, ArticlePage.tsx, ProfilePage.tsx, EditorPage.tsx, MePages.tsx, PostCard.tsx, Sidebar.tsx, TopBar.tsx, actions.tsx, readingRepository.ts, queries.ts, i18n/en.ts.

## Data reality (verified)

| Need | Source | Status |
|---|---|---|
| Spotlight / ranked | `trendingQuery()` → `/posts/trending?limit=6` | available |
| Topics | `tagsQuery()` (sorted by count, has `name`, `count`) | available |
| Writers | `suggestionsQuery()` → `/me/suggestions/users?limit=3` | available, only 3 rows (readingRepository.ts:77) |
| Saved | `feedQuery({ kind: "bookmarks" })` → `/me/bookmarks` | available (readingRepository.ts:42) |
| Your drafts | `feedQuery({ kind: "mine", status: "draft" })` | available |
| Continue reading | none. `read()` is POST-only (readingRepository.ts:82) | **missing** — see P2-4 |

---

## P0 — Remove the strongest Medium signatures

### P0-1 Home: kill "For you / Following" underline tabs
`src/app/pages/HomePage.tsx:116-163`. Medium's home is literally a "For you | Following" underline tab strip. Replace with a segmented control labelled as *lenses*.

- Copy: `["for-you", "Picked for you"]`, `["following", "Your circle"]`, `["latest", "Newest"]`. Signed out: `["latest","Newest"]`, `["following","Your circle"]`.
- Do not use `<Tabs>`. Render a `role="radiogroup"` aria-label="Feed lens":
  - wrapper: `inline-flex rounded-[var(--radius-md)] border border-line bg-surface-2 p-1`
  - item: `h-8 rounded-[var(--radius-sm)] px-3 font-mono text-[12px] uppercase tracking-[0.12em] text-muted transition-colors aria-checked:bg-card aria-checked:text-fg aria-checked:shadow-[var(--shadow-lift)]`
- Sticky bar keeps `sticky top-16 z-30` but drop `border-b`; use `bg-surface/90 backdrop-blur-md py-3`, and put the lens control left + a count `font-mono text-[12px] text-muted` right ("Updated just now" is not available — omit, do not fake).
- Keep URL param values (`for-you`/`following`/`latest`) unchanged — router and tests depend on them.

### P0-2 PostCard: drop avatar+name byline row and "min read"
`src/contexts/reading/ui/PostCard.tsx:30-53`, `src/contexts/reading/domain/post.ts:53`.
- Remove the `<Avatar size="xs">` + author line above the title (Medium's signature card head). Author moves into the mono meta column under the date: `by @{author}` as a link, `font-mono text-[12px] text-muted hover:text-fg`.
- `readTime` → `` `${Math.max(1, minutes)}′` `` is too cute; use `` `${Math.max(1, minutes)} min` `` everywhere and in the meta column prefix with a `ClockIcon size-3.5`. Exact label string: `"6 min"`. Update `post.test.ts` expectation.
- Title stays first visual element of the row. Hover: replace `group-hover:underline` with `group-hover:translate-x-0.5 transition-transform` plus the existing arrow chip.
- Tags: keep `#tag` mono chips (not Medium-like).

### P0-3 Profile: replace name + Home/Lists/Series/About tabs + right sidebar
`src/app/pages/ProfilePage.tsx:181-226`. This is Medium's profile almost 1:1 (big name, Home/About tabs, sticky right column with avatar, followers, bio, Follow).
New layout — single column "masthead" then content, no right aside:
```
<header className="mx-auto max-w-shell px-4 pt-10 md:px-6">
  <div className="grid gap-6 rounded-[var(--radius-xl)] border border-line bg-card p-6 md:grid-cols-[auto_1fr_auto] md:items-center md:p-8">
    <Avatar size="2xl" />
    <div>
      <p className="kicker">@{username} · joined {shortDate}</p>
      <h1 className="mt-2 font-display text-[36px] leading-[40px] font-extrabold tracking-[-0.03em]">{name}</h1>
      <p className="mt-2 max-w-prose text-[15px] leading-6 text-muted">{bio}</p>
    </div>
    <div className="flex items-center gap-2">{follow}</div>
  </div>
  <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-[var(--radius-lg)] border border-line">
    Stories (feed meta.total) | Followers (button) | Following (button)
    dt: kicker; dd: font-mono text-2xl tabular-nums
  </dl>
</header>
```
- Sections become a lens control (same component as P0-1): `Writing`, `Lists`, `Series`. **Delete the "About" tab** — bio and join date now live in the masthead.
- Delete `<aside aria-label="Profile">` and the mobile-only duplicate avatar/counts blocks (lines 184-191).
- Content column: `mx-auto max-w-feed`.
- Own profile: `Edit profile` becomes `<Button variant="outline" size="sm">` (currently `text-accent` link, line 161).
- Follow button on profile: `variant="outline"` not `accent` (solid filled Follow = Medium).

### P0-4 Follow wording
`src/contexts/engagement/ui/actions.tsx:120,125`, `src/app/pages/TagPage.tsx:20`, People modal title `ProfilePage.tsx:33`.
- Writers: `Follow` → `Track`, `Following` → `Tracking` (with `CheckIcon size-4`). aria-label: `Track {username}` / `Stop tracking {username}`.
- Topics (TagPage): `Follow` → `Add to feed`, `Following` → `In your feed`.
- Counts copy: `followers` → `readers`, `following` → `tracking`. Modal titles: `Readers` / `Tracking`. Settings.tsx:381 "Topics you follow" → `Topics in your feed`; desc `"These shape Picked for you."`; :398 `"Add topics from any topic page."`.
- Home empty state (HomePage.tsx:172): title `"Your circle is quiet."`, body `"Track writers from their profile or Writers to watch."`.
- Keep API/hook names (`useFollow`, `is_following`) — copy only.

### P0-5 "Library" → "Saved"
`src/shared/i18n/en.ts:11` (+ ru/uz), `MePages.tsx:29-37`, route stays `/me/library` (no breaking links).
- `nav.library`: `"Saved"`. h1: `"Saved"`. Lens items: `["saved","Bookmarks"]`, `["lists","Lists"]`.
- Empty: title `"Nothing saved."`, body `"Hit the bookmark on any story — it lands here."`.

### P0-6 Editor top bar and publish dialog
`src/app/pages/EditorPage.tsx:72-192, 334-362`. Medium: logo + "Draft in {name}" + `Saved` + green `Publish` pill + avatar; publish dialog = two columns "Story Preview" left / "Publishing to: … Add or change topics (up to 5)…" right, with "Include a high-quality image in your story to make it more inviting to readers." — that string is Medium verbatim (line 114).
Top bar:
- Remove `<Avatar>` (line 359). Replace `<Logo />` with a back link `<Link to="/me/stories">` `ArrowLeftIcon` + `"Stories"` in `font-mono text-[12px] uppercase tracking-[0.12em] text-muted hover:text-fg`.
- Status as a chip: `inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-xs)] border border-line px-2 font-mono text-[11px] uppercase text-muted` with a `size-1.5 bg-fg` dot when "Saved", `animate-pulse` while "Saving…". Add word count from `body`: `"{n} words · {readTime}"`.
- Primary button copy: `"Publish"` → `"Ship it"`; published: `"Update live story"`. Keep `variant="accent"` (it is #171717, grayscale — fine).
- Header class: `sticky top-0 z-40 h-14 border-b border-line bg-surface/90 backdrop-blur-md`.
Publish dialog → right-side **checklist sheet**, single column, not a centered 2-col modal:
- Content class: `fixed inset-y-0 right-0 z-50 w-full max-w-[440px] overflow-y-auto border-l border-line bg-surface p-6 shadow-[var(--shadow-lift)] md:p-8`.
- Title: `"Ready to ship"`. Description visible: `"Check these before it goes live."`
- Ordered steps, each `rounded-[var(--radius-lg)] border border-line bg-card p-4` with `kicker` step number `01/02/03/04`:
  1. `Cover` — dropzone copy `"Drop a cover image (PNG, JPG, WebP, GIF · max 5 MB)"`. Remove the Medium sentence.
  2. `Topics` — `"Up to 5 topics."`
  3. `Byline` — label `"Post as"` (not "Author"/"Publishing to").
  4. `When` — two-option segmented control `Now` / `Schedule` instead of the checkbox.
- Footer sticky: `sticky bottom-0 -mx-6 mt-8 border-t border-line bg-surface px-6 py-4 md:-mx-8 md:px-8`, button full-width `"Ship now"` / `"Schedule"`.
- Remove the "Card preview" title + underlined title line (lines 107, 143); instead show a live mini `PostCard`-style row inside step 1 below the image.

### P0-7 Article byline block
`src/app/pages/ArticlePage.tsx:179-211`. Avatar(lg) + name + Follow + "x min read · date" between rules = Medium byline.
- Replace with a mono **meta strip**, no avatar:
  `<dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line md:grid-cols-4">` each cell `bg-card px-4 py-3`, `dt.kicker`, `dd text-sm font-medium`: `Writer` (link `@name`) · `Published` (date) · `Length` (`6 min`) · `Topic` (`#tag`).
- Kicker above title (lines 167-171) duplicates read time → keep only `#tag`, drop read time there.
- Track button + Edit move to an **author card at the end** of the article, before Discussion: `mt-16 flex items-center gap-4 rounded-[var(--radius-xl)] border border-line bg-card p-6` — Avatar `lg`, `kicker "Written by"`, name `font-display text-xl font-bold`, bio `text-sm text-muted line-clamp-2`, TrackButton right.
- "Keep reading" (line 258) → `"Next up"` rendered as a 2-col card grid (`grid gap-3 sm:grid-cols-2`, cards like Spotlight runners-up) instead of PostCard list.

---

## P1 — Home "Reading Desk" (signed-in) — `src/app/pages/HomePage.tsx`

Goal: a hub, not an infinite list with a sidebar. Remove `HomeGrid`'s `<Sidebar />` **on home only** (Sidebar duplicates Trending and Writers; MePages still use `HomeGrid` → add prop `aside?: boolean` default true, home passes `false`).

Layout (desktop ≥lg), container `mx-auto max-w-shell px-4 md:px-6 pb-24`:

```
[ Greeting header .................................. New draft ]
[ Spotlight lead (col-span-8)        ][ Ranked 02-06 (col-span-4) ]
[ Topic rail — horizontal scroll, full width                      ]
[ Desk: Saved (col-6) | Your drafts (col-3) | Writers (col-3)     ]
[ Lens bar (sticky) ][ Feed max-w-feed ]  [ right: none / spacer  ]
```

### P1-1 Header (replace lines 128-154)
- `pt-8 pb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line`
- Kicker: date as now.
- h1: `Morning, {first}.` / `Afternoon, {first}.` / `Evening, {first}.` by local hour (<12, <18, else). Second line `<span className="text-muted">Here's your desk.</span>`. Classes keep `font-display text-[32px] md:text-[44px] leading-[1.05] font-extrabold tracking-[-0.035em]`.
- Right: `New draft` button (exists) + secondary `<Button variant="outline" size="sm">` `"Saved"` → `/me/library`, with saved count from bookmarks `meta.total` in `font-mono text-[11px] text-muted ml-1` (only if loaded).

### P1-2 Spotlight + ranked column (replace `Spotlight`)
Grid: `mt-8 grid gap-4 lg:grid-cols-12`.
- Lead `lg:col-span-8`: keep current card. Change image to full-bleed top on all sizes (`aspect-[16/9]`), text block below, `#1 today` chip stays. Remove author avatar; author as `kicker` line `@{author}`.
- Ranked `lg:col-span-4`: `<ol className="flex flex-col divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-card">` header row `px-4 py-3 kicker "Rising"`; items 2-6 from `trending.data.slice(1,6)`: `group grid grid-cols-[2.25rem_1fr] gap-3 px-4 py-3 hover:bg-surface-2`; number `font-display text-2xl font-extrabold text-line group-hover:text-fg`; title `font-display text-[15px] leading-5 font-bold line-clamp-2`; meta `font-mono text-[11px] text-muted` `@author · 6 min`.
- Skeleton while pending: `Bone h-[420px] lg:col-span-8` + `Bone h-[420px] lg:col-span-4` (currently returns null → layout jump).
- Hide whole block when `tab === "following"` (keep current rule).

### P1-3 Topic rail (replaces lg:hidden TopicChips at line 164)
- `section aria-labelledby="topics" className="mt-10"`; header row `flex items-center justify-between`: `h2.kicker "Topics"` + link `"All topics →"` to `/search` `font-mono text-[12px] text-muted hover:text-fg`.
- Rail: `mt-3 -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0`.
- Item (top 16 tags): `Link /tag/$tag` `snap-start shrink-0 rounded-[var(--radius-md)] border border-line bg-card px-3.5 py-2.5 transition-colors hover:border-fg` containing `<span className="block font-medium text-sm">#{name}</span><span className="block font-mono text-[11px] text-muted">{compact(count)} stories</span>`.
- Shown on all breakpoints.

### P1-4 The Desk strip (new) — three panels
`section aria-label="Your desk" className="mt-10 grid gap-4 lg:grid-cols-12"`. Panel base: `rounded-[var(--radius-lg)] border border-line bg-card p-5`, header `flex items-center justify-between mb-4` with `h2.kicker` + small link.

1. **Saved** `lg:col-span-6` — `useInfiniteQuery(feedQuery({ kind: "bookmarks" }))`, first page, show 3. Header `"Saved for later"`, link `"Open all"` → `/me/library`. Row: `group flex items-center gap-3 rounded-[var(--radius-sm)] p-2 -mx-2 hover:bg-surface-2`: 48×48 grayscale cover (`size-12 rounded-[var(--radius-sm)] object-cover grayscale`) or initial tile `grid size-12 place-items-center rounded-[var(--radius-sm)] bg-surface-2 font-display font-extrabold text-muted`; title `line-clamp-1 text-sm font-semibold`; meta `font-mono text-[11px] text-muted` `6 min`. Empty: `"Bookmark a story and it waits here."` `text-sm text-muted`.
2. **Your drafts** `lg:col-span-3` — `feedQuery({ kind: "mine", status: "draft" })`, show 3 titles linking `/p/$id/edit`, meta `"edited {timeAgo(updated_at ?? created_at)}"` (verify field exists on `postSchema`; fall back to `created_at`). Header `"On your desk"`, link `"All drafts"` → `/me/stories`. Empty: button `variant="outline" size="sm"` `"Start a draft"`.
3. **Writers to watch** `lg:col-span-3` — `suggestionsQuery()` (3 rows). Row: Avatar `sm`, name `text-sm font-semibold truncate`, `font-mono text-[11px] text-muted` `{compact(followers)} readers`, Track button `size="sm" variant="outline"`. Hide panel if empty and let Saved span `lg:col-span-9`.

Mobile: panels stack; Saved first.

### P1-5 Feed section
- Below desk: `mt-12` sticky lens bar (P0-1) and `<Feed>` constrained to `mx-auto max-w-feed lg:mx-0` with a left-aligned `lg:grid lg:grid-cols-[minmax(0,var(--container-feed))_1fr] lg:gap-14`; right column holds a sticky `top-32` mini panel `"Sparks you gave this week"` — **only if data exists; it doesn't**, so leave the right column empty → simpler: center the feed `mx-auto max-w-feed`. Decision: center it.
- Section heading above lens: `h2 className="font-display text-2xl font-extrabold tracking-[-0.02em]"` `"The stream"`.

### P1-6 Sidebar (other pages still use it) — `src/contexts/reading/ui/Sidebar.tsx`
- "Trending" → `"Rising"`; remove avatar in each item (line 45), author as `font-mono text-[12px] text-muted` `@author`.
- Writers: `{u.followers} followers` → `{compact(u.followers)} readers`.

### P1-7 TopBar — `src/app/layout/TopBar.tsx`
- `Write` button (line 206-211): copy `"New draft"` (matches home), icon `PenLineIcon`. Keep `bg-inverse`.
- Primary nav: `Latest` → `"Newest"` (en.ts:19); add `"Saved"` link for signed-in (`/me/library`).
- User menu: rename `Stories` → `"Your writing"`, `Stats` → `"Insights"`.

---

## P2 — Polish

### P2-1 LandingPage — `src/app/pages/LandingPage.tsx`
Not Medium-like structurally (3D hero, marquee, stats). Fixes:
- Trending grid (148-185): drop `Avatar` per item (Medium's numbered trending with avatar+name is its exact landing pattern); author as `font-mono text-[12px] text-muted @author`. Heading `"Trending on {BRAND}"` → `"Rising this week"`.
- CTA "Start reading" → `"Open the stream"`; "Start writing" → `"Start a draft"`; bottom CTA "See all stories" → `"Browse newest"`.
- Stats `dl`: "Trending now" shows `trending.data.length` which is capped at 6 (readingRepository.ts:65) — a fake-looking number. Replace with `["Writers", …]` only if a count endpoint exists; otherwise drop the third cell and use `grid-cols-2`.

### P2-2 Sparks bar on article — `ArticlePage.tsx:34-74`
Floating pill with clap/comment/bookmark is a Medium pattern too. Convert to a **left rail** on xl: `xl:fixed xl:left-[max(1rem,calc(50%-var(--container-article)/2-5rem))] xl:top-1/3 xl:flex-col xl:w-12` vertical stack; below xl keep the sticky bottom pill. Add visible label under Sparks count `font-mono text-[10px] uppercase text-muted` `"sparks"`.

### P2-3 Drop cap — `styles.css:360`
`.prose-article > p:first-of-type::first-letter` gradient drop cap reads as editorial-magazine, fine; keep.

### P2-4 Continue reading (blocked on backend)
No GET for read progress. Two options:
- **Recommended:** backend adds `GET /me/reading?limit=4` returning posts with `progress`; client adds `FeedSource { kind: "reading" }` → Desk panel `"Pick up where you left off"` with a progress bar `h-1 rounded-full bg-surface-2` / fill `bg-fg`. Owner: backend lead. Until then the panel is not rendered.
- Rejected: localStorage-only history — not cross-device, contradicts the "remembered on every device" landing claim (LandingPage.tsx:40).

### P2-5 i18n
All copy changes above must land in `en.ts`, `ru.ts`, `uz.ts` for keys that exist (`nav.library`, `nav.latest`, `nav.write`); the rest are hard-coded today — leave hard-coded, do not expand scope.

---

## Acceptance checklist
- [ ] No `For you` / `Following` / `Follow` / `Library` / `min read` / `Publish` strings visible on client (grep `src/**/*.tsx`, `src/shared/i18n/*.ts`).
- [ ] No Avatar in PostCard, Sidebar trending, Landing trending, Article header.
- [ ] Profile has no right `<aside>` and no About tab.
- [ ] Publish UI is a right sheet with 4 numbered steps; Medium cover sentence gone.
- [ ] Home shows Spotlight+Rising, Topic rail, Desk (Saved, Drafts, Writers), lens bar, feed; no Sidebar on home.
- [ ] Only existing tokens used; no hex colors added.
- [ ] Update tests: `post.test.ts` (readTime), `LandingPage.test.tsx`, `EditorPage.test.tsx`, `Feed.test.tsx` for changed copy.
