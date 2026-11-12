import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRouted } from "@/test/render";
import { AboutPage, ContactPage, HelpPage, PrivacyPage } from "./LegalPages";

describe("info pages", () => {
  it.each([
    ["About", AboutPage, "/about"],
    ["Contact", ContactPage, "/contact"],
    ["Help", HelpPage, "/help"],
  ] as const)("%s renders without the legal draft notice", async (name, Page, path) => {
    await renderRouted(<Page />, { path });
    expect(await screen.findByRole("heading", { level: 1, name })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("legal pages keep the draft notice", async () => {
    await renderRouted(<PrivacyPage />, { path: "/privacy" });
    expect(await screen.findByRole("note")).toBeInTheDocument();
  });
});
