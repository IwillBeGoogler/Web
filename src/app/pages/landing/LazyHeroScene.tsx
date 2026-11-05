import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { HeroFallback } from "./HeroFallback";

const load = () => import("./HeroScene");
const HeroScene = lazy(load);

/** A failed chunk import renders the static fallback instead of crashing the page. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <HeroFallback /> : this.props.children;
  }
}

/**
 * Defers the three.js chunk until the browser is idle after the hero text paints,
 * so three never lands in the entry chunk. Until then the static SVG holds the box.
 */
export function LazyHeroScene() {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setGo(true), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => setGo(true), 200);
    return () => clearTimeout(id);
  }, []);
  if (!go) return <HeroFallback />;
  return (
    <Guard>
      <Suspense fallback={<HeroFallback />}>
        <HeroScene />
      </Suspense>
    </Guard>
  );
}
