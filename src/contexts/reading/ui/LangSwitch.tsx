import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

type Props = {
  languages: readonly string[];
  value: string;
  onChange: (lang: string) => void;
  /** Author only: link to the translation editor. */
  addHref?: { to: "/p/$id/translate"; params: { id: string } };
};

/** Segmented "UZ | EN" switch between a story's original language and its translations. */
export function LangSwitch({ languages, value, onChange, addHref }: Props) {
  if (languages.length < 2 && !addHref) return null;
  return (
    <div role="group" aria-label="Article language" data-chrome="" className="seg">
      {languages.map((l) => (
        <button key={l} type="button" aria-pressed={l === value} onClick={() => onChange(l)} className="seg-item h-7 px-2.5">
          {l}
        </button>
      ))}
      {addHref ? (
        <Link {...addHref} aria-label="Add or edit translation" className="seg-item h-7 px-2">
          <PlusIcon className="size-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
