import { useQuery } from "@tanstack/react-query";
import { HighlighterIcon, Trash2Icon } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { Button } from "@/shared/ui/button";
import { toast } from "@/shared/ui/toast";
import { highlightsQuery, useHighlightMutations } from "../application/hooks";
import { runeRange } from "../domain/collections";

/**
 * Floating "Highlight" button over a text selection inside the article,
 * and the reader's own / most popular highlights below it.
 */
export function Highlighter({ postId, body, container }: { postId: number; body: string; container: RefObject<HTMLElement | null> }) {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const { add } = useHighlightMutations(postId);
  useEffect(() => {
    const onUp = () => {
      const s = getSelection();
      const el = container.current;
      if (!s || s.isCollapsed || !el || !s.anchorNode || !el.contains(s.anchorNode)) return setSel(null);
      const text = s.toString();
      if (text.trim().length < 3) return setSel(null);
      const r = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text, x: r.left + r.width / 2 + scrollX, y: r.top + scrollY });
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onUp);
    };
  }, [container]);
  if (!sel) return null;
  return (
    <div className="absolute z-40 -translate-x-1/2 -translate-y-full pb-2" style={{ left: sel.x, top: sel.y }}>
      <Button
        size="sm"
        onMouseDown={(e) => e.preventDefault()}
        onClick={requireAuth(() => {
          const r = runeRange(body, sel.text);
          if (!r) return toast.error("Couldn't match that passage. Try a shorter selection.");
          add.mutate(r, {
            onSuccess: () => {
              toast.ok("Highlighted");
              getSelection()?.removeAllRanges();
              setSel(null);
            },
            onError: toast.error,
          });
        })}
      >
        <HighlighterIcon className="size-4" aria-hidden /> Highlight
      </Button>
    </div>
  );
}

export function HighlightsPanel({ postId }: { postId: number }) {
  const q = useQuery(highlightsQuery(postId));
  const { remove } = useHighlightMutations(postId);
  const top = q.data?.top ?? [];
  const mine = q.data?.mine ?? [];
  if (!top.length && !mine.length) return null;
  return (
    <section aria-label="Highlights" className="mt-10 space-y-6">
      {top[0] ? (
        <figure className="border-l-[3px] border-accent pl-5">
          <figcaption className="text-xs tracking-wide text-muted uppercase">Top highlight{top[0].count ? ` · ${top[0].count} readers` : ""}</figcaption>
          <blockquote className="mt-2 bg-accent/10 font-serif text-lg">{top[0].text}</blockquote>
        </figure>
      ) : null}
      {mine.length ? (
        <div>
          <h2 className="text-sm font-semibold">Your highlights</h2>
          <ul className="mt-3 space-y-3">
            {mine.map((h) => (
              <li key={h.id ?? h.start} className="flex items-start gap-3">
                <p className="flex-1 bg-accent/10 font-serif">
                  <Bio>{h.text}</Bio>
                </p>
                {h.id ? (
                  <Button variant="ghost-icon" className="size-8 [&_svg]:size-4" aria-label="Remove highlight" onClick={() => remove.mutate(h.id as number)}>
                    <Trash2Icon aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
