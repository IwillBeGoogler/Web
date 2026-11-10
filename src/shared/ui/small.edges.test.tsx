import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Avatar, hueFor, initialsOf } from "./avatar";
import { PasswordInput } from "./form";

describe("Avatar", () => {
  it("falls back to ? for an empty name", () => {
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf("ada lovelace byron")).toBe("AL");
  });
  it("labels the fallback when unlabelled and renders without an image", () => {
    render(<Avatar name="Ada Lovelace" labelled={false} />);
    expect(screen.getByLabelText("Ada Lovelace")).toBeInTheDocument();
    render(<Avatar name="Bob" src="/x.png" />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});

describe("Avatar image", () => {
  it("shows the image once loaded, hidden from AT when labelled and named when not", async () => {
    class LoadingImage extends EventTarget {
      referrerPolicy = "";
      crossOrigin: string | null = null;
      complete = false;
      naturalWidth = 1;
      set src(_v: string) {
        this.complete = true;
        queueMicrotask(() => this.dispatchEvent(new Event("load")));
      }
    }
    vi.stubGlobal("Image", LoadingImage);
    try {
      const { container } = render(<Avatar name="Ada" src="/a.png" />);
      await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
      expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
      render(<Avatar name="Grace" src="/g.png" labelled={false} />);
      expect(await screen.findByAltText("Grace")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("hueFor", () => {
  it("is deterministic, picks one of the dark hues and spreads seeds", () => {
    expect(hueFor("ali")).toBe(hueFor("ali"));
    expect(hueFor("")).toMatch(/^bg-\[#[0-9a-f]{6}\]$/);
    const seen = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "ali", "bob"].map(hueFor));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("PasswordInput", () => {
  it("toggles visibility", async () => {
    render(<PasswordInput aria-label="pw" />);
    expect(screen.getByLabelText("pw")).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("pw")).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("pw")).toHaveAttribute("type", "password");
  });
});
