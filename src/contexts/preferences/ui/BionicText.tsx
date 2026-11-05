import { useReadingPrefs } from "../application/store";
import { bionicSegments } from "../domain/reading";

/** Plain text that follows the reader's bionic setting anywhere in the UI. */
export function Bio({ children }: { children: string | null | undefined }) {
  const { bionic } = useReadingPrefs();
  if (!children) return null;
  if (!bionic) return <>{children}</>;
  return (
    <>
      {bionicSegments(children).map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static per string
        <span key={i}>
          {s.b ? <b className="bionic">{s.b}</b> : null}
          {s.t ? <span className="bionic-rest">{s.t}</span> : null}
        </span>
      ))}
    </>
  );
}
