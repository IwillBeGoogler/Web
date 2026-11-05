import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRouted } from "@/test/render";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("is the iBlog wordmark linking home", async () => {
    await renderRouted(<Logo />);
    const link = screen.getByRole("link", { name: "iBlog home" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent("iBlog");
  });
});
