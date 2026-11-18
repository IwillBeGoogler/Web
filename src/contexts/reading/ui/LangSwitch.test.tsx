import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LangSwitch } from "./LangSwitch";

describe("LangSwitch", () => {
  it("marks the active language and reports changes", async () => {
    const onChange = vi.fn();
    render(<LangSwitch languages={["uz", "en"]} value="uz" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Article language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "uz" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "en" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "en" }));
    expect(onChange).toHaveBeenCalledWith("en");
  });

  it("hides with a single language", () => {
    const { container } = render(<LangSwitch languages={["uz"]} value="uz" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
