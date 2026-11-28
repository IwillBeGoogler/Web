import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { inputBoxCls } from "@/shared/ui/form";
import type { Challenge } from "../domain/challenges";

/** "Add to challenge" in the publish dialog; 0 means none. */
export function ChallengeSelect({ challenges, value, onChange }: { challenges: Challenge[]; value: number; onChange: (id: number) => void }) {
  const t = useT();
  return (
    <label className="block font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
      {t("challenge.addTo")}
      <select
        className={cn(inputBoxCls, "mt-1 font-sans normal-case tracking-normal text-fg")}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={0}>{t("challenge.none")}</option>
        {challenges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </label>
  );
}
