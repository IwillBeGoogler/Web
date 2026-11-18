import { useEffect, useId, useState } from "react";

/**
 * A ```mermaid block as a diagram. The library loads on first use, in its own chunk; it draws in "strict" mode (its own sanitizing, no
 * click handlers), and while it loads, or if the source does not parse, the reader sees the source as text.
 */
export function MermaidBlock({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/:/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSvg(null);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
        });
        const out = await mermaid.render(id, code);
        if (live) setSvg(out.svg);
      })
      .catch(() => {
        document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      live = false;
    };
  }, [code, id]);
  if (!svg) {
    return (
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable code block must be reachable by keyboard
      <pre tabIndex={0} className="mermaid-source">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <figure className="mermaid-figure" aria-label="Diagram">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG drawn by mermaid in strict mode from the code above */}
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  );
}
