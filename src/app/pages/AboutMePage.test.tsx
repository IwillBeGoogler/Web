import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRouted } from "@/test/render";
import { AboutMePage } from "./AboutMePage";
import { jobs, projects } from "./about-me/content";

describe("AboutMePage", () => {
  it("renders profile, open source and experience", async () => {
    await renderRouted(<AboutMePage />, { path: "/about-me" });
    expect(await screen.findByRole("heading", { level: 1, name: "Bakhodir Mansurov" })).toBeInTheDocument();
    for (const p of projects)
      expect(screen.getByRole("link", { name: new RegExp(`^${p.name}`) })).toHaveAttribute("href", `https://github.com/bakhod1r/${p.name}`);
    for (const j of jobs) expect(screen.getByRole("heading", { level: 3, name: new RegExp(j.company) })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});
