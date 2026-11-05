import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BarChart3Icon,
  BellIcon,
  BookmarkIcon,
  BuildingIcon,
  ChevronDownIcon,
  FileTextIcon,
  LogOutIcon,
  MessageSquareWarningIcon,
  MoonIcon,
  PenLineIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { WriteMenu } from "@/contexts/diagrams/ui/WriteMenu";
import { feedbackDialog } from "@/contexts/engagement/application/feedbackDialog";
import { notificationsQuery } from "@/contexts/engagement/application/hooks";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useLogout, useMe } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { readingPrefs } from "@/contexts/preferences/application/store";
import { useT } from "@/shared/i18n";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { useDark } from "@/shared/ui/theme";
import { Logo } from "./Logo";

const item =
  "flex h-9 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";

export { Logo } from "./Logo";

const navLink = "seg-item h-7 data-[status=active]:bg-inverse data-[status=active]:text-on-inverse";
const sep = <span aria-hidden className="hidden h-6 w-px bg-line md:block" />;
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function SearchBox() {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(isMac()), []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        return;
      }
      const el = e.target as HTMLElement;
      if (e.key !== "/" || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, []);
  return (
    <form
      role="search"
      className="hidden h-9 w-72 items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-2.5 font-mono text-[12px] text-muted focus-within:border-fg focus-within:bg-card focus-within:shadow-[2px_2px_0_0_var(--fg)] md:flex lg:w-96"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) void nav({ to: "/search", search: { q: q.trim() } });
      }}
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQ("");
            e.currentTarget.blur();
          }
        }}
        className="w-full min-w-0 bg-transparent text-fg outline-none placeholder:text-muted"
        placeholder={t("nav.search")}
        aria-label={t("nav.search")}
      />
      <kbd className="kbd hidden shrink-0 whitespace-nowrap lg:inline-grid" aria-hidden>
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
      <kbd className="kbd hidden shrink-0 lg:inline-grid" aria-hidden>
        /
      </kbd>
    </form>
  );
}

function Bell() {
  const t = useT();
  const q = useInfiniteQuery(notificationsQuery());
  const unread = q.data?.pages[0]?.unread ?? 0;
  const prev = useRef(unread);
  const [ring, setRing] = useState(0);
  useEffect(() => {
    if (unread > prev.current) setRing((r) => r + 1);
    prev.current = unread;
  }, [unread]);
  return (
    <Button variant="ghost-icon" asChild className="relative">
      <Link to="/me/notifications" aria-label={unread ? t("nav.notificationsUnread", { n: unread }) : t("nav.notifications")}>
        <BellIcon key={ring} strokeWidth={1.5} aria-hidden className={ring ? "animate-wiggle motion-reduce:animate-none" : undefined} />
        {unread ? (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-[var(--radius-xs)] bg-inverse px-1 font-mono text-[10px] leading-none text-on-inverse ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

function UserMenu() {
  const t = useT();
  const { me } = useMe();
  const logout = useLogout();
  const dark = useDark();
  const nav = useNavigate();
  if (!me) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-strong pr-1.5 pl-0.5 hover:border-fg data-[state=open]:border-fg"
        aria-label={t("nav.accountMenu")}
      >
        <Avatar name={displayName(me)} src={me.avatar_url} size="md" className="size-7" />
        <ChevronDownIcon className="size-3.5 text-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="menu-pop z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[3px_3px_0_0_var(--fg)]"
        >
          <DropdownMenu.Label className="tile-head truncate rounded-none normal-case tracking-normal">@{me.username}</DropdownMenu.Label>
          <div className="p-1">
            <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/@{$username}", params: { username: me.username } })}>
              <UserIcon aria-hidden /> {t("nav.profile")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/me/library" })}>
              <BookmarkIcon aria-hidden /> {t("nav.library")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/me/stories" })}>
              <FileTextIcon aria-hidden /> {t("nav.stories")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/me/stats" })}>
              <BarChart3Icon aria-hidden /> {t("nav.stats")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/me/publications" })}>
              <BuildingIcon aria-hidden /> {t("nav.publications")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/me/settings" })}>
              <SettingsIcon aria-hidden /> {t("nav.settings")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => readingPrefs.set({ palette: dark ? "daylight" : "galaxy" })}>
              {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />} {dark ? t("nav.lightMode") : t("nav.darkMode")}
            </DropdownMenu.Item>
          </div>
          <DropdownMenu.Separator className="h-px bg-line" />
          <div className="p-1">
            <DropdownMenu.Item className={item} onSelect={() => feedbackDialog.open()}>
              <MessageSquareWarningIcon aria-hidden /> {t("feedback.link")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => logout.mutate(undefined, { onSettled: () => nav({ to: "/" }) })}>
              <LogOutIcon aria-hidden /> {t("nav.signOut")}
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const useScrolled = (px = 8) => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(scrollY > px);
    f();
    addEventListener("scroll", f, { passive: true });
    return () => removeEventListener("scroll", f);
  }, [px]);
  return on;
};

/** Quick light/dark switch; the footer picks any palette. */
function ThemeToggle() {
  const t = useT();
  const dark = useDark();
  return (
    <Button
      variant="ghost-icon"
      aria-label={t("nav.toggleTheme")}
      title={t("nav.toggleTheme")}
      onClick={() => readingPrefs.set({ palette: dark ? "daylight" : "galaxy" })}
    >
      {dark ? <SunIcon strokeWidth={1.5} aria-hidden /> : <MoonIcon strokeWidth={1.5} aria-hidden />}
    </Button>
  );
}

/** Signed-out readers have no account menu: a quiet icon keeps feedback reachable, also inside the diagram editor. */
function FeedbackButton() {
  const t = useT();
  return (
    <Button variant="ghost-icon" aria-label={t("feedback.link")} title={t("feedback.link")} onClick={() => feedbackDialog.open()}>
      <MessageSquareWarningIcon strokeWidth={1.5} aria-hidden />
    </Button>
  );
}

export function TopBar() {
  const t = useT();
  const { me } = useMe();
  const scrolled = useScrolled();
  return (
    <header data-chrome className={`liquid-glass sticky top-0 z-40 h-14 border-x-0 border-t-0 ${scrolled ? "shadow-[0_2px_0_0_var(--line)]" : ""}`}>
      <div className="mx-auto flex h-full max-w-shell items-center gap-4 px-4 md:px-6">
        <Logo />
        {sep}
        <nav aria-label="Primary" className="seg hidden md:inline-flex">
          <Link to="/" search={{ tab: "latest" }} className={navLink} activeOptions={{ includeSearch: true }}>
            {t("nav.latest")}
          </Link>
          {me ? (
            <Link to="/me/library" className={navLink}>
              {t("nav.library")}
            </Link>
          ) : null}
          {me ? (
            <Link to="/d" className={navLink}>
              {t("nav.diagrams")}
            </Link>
          ) : null}
          <Link to="/search" className={navLink}>
            {t("nav.topics")}
          </Link>
        </nav>
        {sep}
        <SearchBox />
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Button variant="ghost-icon" asChild className="md:hidden">
            <Link to="/search" aria-label={t("nav.search")}>
              <SearchIcon strokeWidth={1.5} aria-hidden />
            </Link>
          </Button>
          <ThemeToggle />
          {me ? null : <FeedbackButton />}
          {me ? (
            <>
              <div className="flex items-center gap-1">
                <Link
                  to="/new-story"
                  className="hidden h-8 shrink-0 items-center whitespace-nowrap gap-2 rounded-[var(--radius-sm)] bg-inverse px-3 font-mono text-[12px] font-medium tracking-[0.08em] text-on-inverse uppercase shadow-[inset_0_-2px_0_0_color-mix(in_srgb,var(--on-inverse)_22%,transparent)] transition-colors hover:bg-accent-hover md:inline-flex"
                >
                  <PenLineIcon className="size-4" strokeWidth={1.5} aria-hidden /> {t("nav.write")}
                </Link>
                <WriteMenu />
              </div>
              <Bell />
              <UserMenu />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => authDialog.open("signin")}>
                {t("nav.signIn")}
              </Button>
              <Button size="sm" onClick={() => authDialog.open("signup")}>
                {t("nav.getStarted")}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
