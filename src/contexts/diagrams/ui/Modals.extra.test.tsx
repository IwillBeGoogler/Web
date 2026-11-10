import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmModal, RenameModal } from "./Modals";

describe("Modals extras", () => {
  it("ignores a blank rename submit", () => {
    const onSubmit = vi.fn();
    render(<RenameModal open title="Rename" initial="A" pending={false} onClose={() => {}} onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: " B " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledWith("B");
  });
  it("confirm closes on Escape and runs the action", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmModal open title="T" body="B" confirm="Do it" pending={false} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Do it" }));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
