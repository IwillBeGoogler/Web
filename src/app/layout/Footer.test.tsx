import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readingPrefs } from "@/contexts/preferences/application/store";
import { consent } from "@/shared/consent";
import { i18n } from "@/shared/i18n";
import { renderRouted } from "@/test/render";
import { PrivacyPage, TermsPage } from "../pages/LegalPages";
import { CookieBanner } from "./CookieBanner";
import { Footer } from "./Footer";

describe("footer, cookie banner and legal pages", () => {
  afterEach(() => {
    i18n.set("en");
    consent.reset();
    readingPrefs.reset();
  });

  it("switches language and theme", async () => {
    const { user } = await renderRouted(<Footer />);
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "uz");
    expect(screen.getByRole("link", { name: "Maxfiylik siyosati" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Mavzu" }), "nord");
    expect(readingPrefs.get().palette).toBe("nord");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("asks for consent once and can ask again", async () => {
    const { user } = await renderRouted(
      <>
        <CookieBanner />
        <Footer />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Necessary only" }));
    expect(consent.get()).toBe("necessary");
    expect(screen.queryByRole("region", { name: "Cookies" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cookie settings" }));
    await user.click(screen.getByRole("button", { name: "Accept all" }));
    expect(consent.get()).toBe("all");
  });

  it("renders the legal pages in the chosen language", async () => {
    i18n.set("ru");
    await renderRouted(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Политика конфиденциальности" })).toBeInTheDocument();
    expect(document.title).toBe("Политика конфиденциальности — iBlog");
  });

  it("renders the terms", async () => {
    await renderRouted(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeInTheDocument();
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
  });
});
