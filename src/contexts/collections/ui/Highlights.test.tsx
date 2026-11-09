import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { HighlightsPanel, Highlighter } from "./Highlights";

const BODY = "Alpha beta gamma delta";

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => ({ left: 10, top: 20, width: 30, height: 5, right: 40, bottom: 25, x: 10, y: 20, toJSON: () => ({}) });
});
afterEach(() => {
  tokens.set(null);
  authDialog.close();
  getSelection()?.removeAllRanges();
});

function Host({ body = BODY }: { body?: string }) {
  const ref = createRef<HTMLDivElement>();
  return (
    <>
      <div ref={ref} data-testid="art">
        <p>{BODY}</p>
      </div>
      <p data-testid="outside">outside text</p>
      <Highlighter postId={1} body={body} container={ref} />
    </>
  );
}

function select(node: Node, from: number, to: number) {
  const r = document.createRange();
  r.setStart(node, from);
  r.setEnd(node, to);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
  act(() => {
    document.dispatchEvent(new Event("mouseup"));
  });
}

describe("Highlighter", () => {
  it("shows nothing without selection or with outside/short selection", async () => {
    await renderRouted(<Host />);
    act(() => {
      document.dispatchEvent(new Event("keyup"));
    });
    expect(screen.queryByRole("button", { name: /Highlight/ })).toBeNull();
    select(screen.getByTestId("outside").firstChild as Node, 0, 7);
    expect(screen.queryByRole("button", { name: /Highlight/ })).toBeNull();
    select(screen.getByTestId("art").querySelector("p")?.firstChild as Node, 0, 2);
    expect(screen.queryByRole("button", { name: /Highlight/ })).toBeNull();
  });

  it("clears when selection collapses", async () => {
    await renderRouted(<Host />);
    const text = screen.getByTestId("art").querySelector("p")?.firstChild as Node;
    select(text, 0, 5);
    expect(await screen.findByRole("button", { name: /Highlight/ })).toBeInTheDocument();
    getSelection()?.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event("mouseup"));
    });
    expect(screen.queryByRole("button", { name: /Highlight/ })).toBeNull();
  });

  it("opens sign-in when signed out", async () => {
    await renderRouted(<Host />);
    select(screen.getByTestId("art").querySelector("p")?.firstChild as Node, 0, 5);
    const btn = await screen.findByRole("button", { name: /Highlight/ });
    fireEvent.mouseDown(btn);
    fireEvent.click(btn);
    expect(authDialog.get()).toBe("signin");
  });

  it("adds highlight and hides button", async () => {
    signIn();
    let body: unknown;
    server.use(
      http.post(api("/posts/1/highlights"), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(api("/posts/1/highlights"), () => HttpResponse.json({ data: { top: [], mine: [] } })),
    );
    await renderRouted(<Host />);
    select(screen.getByTestId("art").querySelector("p")?.firstChild as Node, 0, 5);
    fireEvent.click(await screen.findByRole("button", { name: /Highlight/ }));
    await waitFor(() => expect(body).toEqual({ start: 0, end: 5 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Highlight/ })).toBeNull());
  });

  it("errors when text is not in body", async () => {
    signIn();
    await renderRouted(<Host body="something else entirely" />);
    select(screen.getByTestId("art").querySelector("p")?.firstChild as Node, 0, 5);
    fireEvent.click(await screen.findByRole("button", { name: /Highlight/ }));
    expect(await screen.findByText(/Couldn't match that passage/)).toBeInTheDocument();
  });

  it("toasts server error", async () => {
    signIn();
    server.use(http.post(api("/posts/1/highlights"), () => HttpResponse.json({ status: 500, detail: "nope" }, { status: 500 })));
    await renderRouted(<Host />);
    select(screen.getByTestId("art").querySelector("p")?.firstChild as Node, 0, 5);
    fireEvent.click(await screen.findByRole("button", { name: /Highlight/ }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
    expect(screen.getByRole("button", { name: /Highlight/ })).toBeInTheDocument();
  });

  it("removes listeners on unmount", async () => {
    const spy = vi.spyOn(document, "removeEventListener");
    const { unmount } = await renderRouted(<Host />);
    unmount();
    expect(spy).toHaveBeenCalledWith("mouseup", expect.any(Function));
    spy.mockRestore();
  });

  it("ignores events when container ref is empty", async () => {
    const ref = { current: null };
    await renderRouted(<Highlighter postId={1} body={BODY} container={ref} />);
    act(() => {
      document.dispatchEvent(new Event("mouseup"));
    });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("HighlightsPanel", () => {
  it("renders nothing when empty", async () => {
    server.use(http.get(api("/posts/1/highlights"), () => HttpResponse.json({ data: { top: null, mine: null } })));
    const { qc } = await renderRouted(<HighlightsPanel postId={1} />);
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(screen.queryByRole("region", { name: "Highlights" })).toBeNull();
  });

  it("shows top highlight and mine; removes one", async () => {
    signIn();
    let deleted = 0;
    server.use(
      http.get(api("/posts/1/highlights"), () =>
        HttpResponse.json({
          data: {
            top: [{ text: "popular bit", start: 0, end: 3, count: 4 }],
            mine: [
              { id: 9, text: "my bit", start: 1, end: 2 },
              { text: "anon bit", start: 5, end: 6 },
            ],
          },
        }),
      ),
      http.delete(api("/highlights/9"), () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<HighlightsPanel postId={1} />);
    expect(await screen.findByText("popular bit")).toBeInTheDocument();
    expect(screen.getByText(/4 readers/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove highlight" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Remove highlight" }));
    await waitFor(() => expect(deleted).toBe(1));
  });

  it("top without count, no mine", async () => {
    server.use(http.get(api("/posts/1/highlights"), () => HttpResponse.json({ data: { top: [{ text: "t", start: 0, end: 1 }], mine: [] } })));
    await renderRouted(<HighlightsPanel postId={1} />);
    expect(await screen.findByText("Top highlight")).toBeInTheDocument();
    expect(screen.queryByText("Your highlights")).toBeNull();
  });

  it("mine only", async () => {
    server.use(http.get(api("/posts/1/highlights"), () => HttpResponse.json({ data: { top: [], mine: [{ id: 1, text: "m", start: 0, end: 1 }] } })));
    await renderRouted(<HighlightsPanel postId={1} />);
    expect(await screen.findByText("Your highlights")).toBeInTheDocument();
    expect(screen.queryByText(/Top highlight/)).toBeNull();
  });
});
