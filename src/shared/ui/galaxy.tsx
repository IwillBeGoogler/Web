import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; depth: number; phase: number; speed: number; flare: boolean };

/** "#rrggbb" + alpha -> rgba(); canvas gradients don't reliably parse color-mix(). */
const rgba = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m?.[1] ? Number.parseInt(m[1], 16) : 0x9aa6ff;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Screen height fraction of the Earth's rim drawn by EarthHorizon. */
const HORIZON = 0.64;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Fixed night sky behind the whole app: dense twinkling starfield, Milky Way,
 * shooting stars, and the sunrise glow that climbs from behind the 3D Earth
 * (EarthHorizon) as the page scrolls. Light themes get a daytime sky with the sun fully up.
 * Decorative only; paused while hidden, a still frame with reduced motion or `still` (behind blurred panels a live sky repaints them every frame).
 */
export function Galaxy({ planet = true, still: frozen = false }: { planet?: boolean; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const planetRef = useRef(planet);
  planetRef.current = planet;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    // reduced motion, or the reader's focus mode: one still frame, no twinkle, meteors or warp
    const calm = () => frozen || reduce.matches || document.documentElement.classList.contains("focus-mode");
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let accent = "";
    let day = false; // light theme: daytime sky, sun fully up
    let raf = 0;
    let sunUp = 0; // eased sunrise, follows scroll
    let starMul = 1; // star opacity multiplier (fades stars in at dusk in the daylight theme)
    let band: Star[] = [];
    // Warp: scroll velocity sends a field of stars streaking past the viewer, then it settles.
    type Flyer = { x: number; y: number; z: number };
    const WARP_STARS = 260;
    let flyers: Flyer[] = [];
    let warp = 0; // 0..1, eased from scroll speed
    let warpDir = 1; // +1 scrolling down (fly forward), -1 up (fly back)
    let lastY = window.scrollY;
    let lastT = performance.now();
    const spawn = (z = Math.random()): Flyer => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: 0.05 + z * 0.95 });

    const theme = () => {
      accent = css("--accent") || "#9aa6ff";
      day = !document.documentElement.classList.contains("dark");
    };

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.round((w * h) / 480) }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.3 + depth * depth * 1.4,
          depth,
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 1.8,
          flare: depth > 0.96,
        };
      });
      flyers = Array.from({ length: WARP_STARS }, () => spawn());
      // Milky Way: dense faint dust along a diagonal band
      const len = Math.hypot(w, h);
      band = Array.from({ length: Math.round((w * h) / 300) }, () => {
        const along = Math.random();
        const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~gaussian across the band
        const x = along * w;
        const y = h * 0.9 - along * h * 0.75 + g * len * 0.07;
        return { x, y, r: 0.25 + Math.random() * 0.55, depth: Math.random() * 0.5, phase: Math.random() * 6.28, speed: 0.3 + Math.random(), flare: false };
      });
    };

    /** Stars on a 3D tunnel, projected from the screen centre; length of each streak follows warp speed. */
    const drawWarp = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      const speed = dt > 0 ? Math.abs(dy) / dt : 0; // px per second
      if (Math.abs(dy) > 0.5) warpDir = dy > 0 ? 1 : -1;
      const target = calm() || day ? 0 : Math.min(1, speed / 2400);
      warp += (target - warp) * (target > warp ? 0.25 : 0.08);
      if (warp < 0.01) return;
      const cx = w / 2;
      const cy = h * 0.42;
      const scale = Math.max(w, h) * 0.5;
      const step = warp * dt * 1.6 * warpDir;
      ctx.save();
      ctx.lineCap = "round";
      for (const f of flyers) {
        const z0 = f.z;
        f.z -= step;
        if (f.z <= 0.03 || f.z > 1) Object.assign(f, spawn(warpDir > 0 ? 1 : 0.02));
        const x1 = cx + (f.x / f.z) * scale;
        const y1 = cy + (f.y / f.z) * scale;
        // tail reaches back along the line of flight; longer when faster
        const zt = Math.max(0.03, Math.min(1, z0 + Math.abs(step) * 6 * warpDir));
        const x0 = cx + (f.x / zt) * scale;
        const y0 = cy + (f.y / zt) * scale;
        if (x1 < -50 || x1 > w + 50 || y1 < -50 || y1 > h + 50) continue;
        const near = 1 - f.z;
        ctx.globalAlpha = Math.min(1, warp * (0.25 + near));
        ctx.strokeStyle = near > 0.7 ? "#ffffff" : "#c9d1ff";
        ctx.lineWidth = 0.4 + near * 1.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawStars = (t: number) => {
      const s1 = t / 1000;
      for (const s of stars) {
        const drift = s1 * (1.5 + s.depth * 4);
        const x = (s.x + drift) % w;
        const y = s.y;
        const tw = 0.5 + 0.5 * Math.sin(s.phase + s1 * s.speed);
        const a = (0.2 + s.depth * 0.8) * tw;
        ctx.globalAlpha = a * starMul;
        ctx.fillStyle = s.depth > 0.85 ? (s.phase < 1 ? "#ffd9a8" : s.phase < 2 ? "#a8c8ff" : "#ffffff") : "#c9cffc";
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.flare && tw > 0.75) {
          // four-point sparkle on the brightest stars
          const len = s.r * 6 * tw;
          ctx.globalAlpha = a * 0.7 * starMul;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x - len, y);
          ctx.lineTo(x + len, y);
          ctx.moveTo(x, y - len);
          ctx.lineTo(x, y + len);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    /** Daylight: pale blue sky fading to white at the horizon, no Milky Way, stars or meteors. */
    const drawDay = () => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#b9cdfb");
      sky.addColorStop(0.45, "#dfe7ff");
      sky.addColorStop(0.75, "#f4f6ff");
      sky.addColorStop(1, "#ffffff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const haze = ctx.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, w * 0.6);
      haze.addColorStop(0, rgba(accent, 0.06));
      haze.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);
    };

    /** Daylight theme: sun is up, then sets over the last ~1.2 screens of the page (matches EarthHorizon). */
    const daySun = () => {
      if (!planetRef.current) return 1;
      const left = document.documentElement.scrollHeight - h - window.scrollY;
      return Math.max(0, Math.min(1, left / (h * 1.2)));
    };

    /** As the sun sets: warm glow on the horizon, then the sky turns to night and the stars come out. */
    const drawDusk = (t: number) => {
      if (!planetRef.current) return; // story pages keep a plain daytime sky
      const night = 1 - sunUp; // 0 = full day, 1 = sun gone
      if (night < 0.01) return;
      const top = h * HORIZON;
      const glow = Math.sin(Math.min(1, night * 1.4) * Math.PI); // peaks mid-sunset
      const dusk = ctx.createLinearGradient(0, top - h * 0.5, 0, top + 40);
      dusk.addColorStop(0, "rgba(255, 140, 90, 0)");
      dusk.addColorStop(0.7, `rgba(255, 140, 90, ${0.35 * glow})`);
      dusk.addColorStop(1, `rgba(255, 190, 120, ${0.55 * glow})`);
      ctx.fillStyle = dusk;
      ctx.fillRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgba(4, 6, 22, ${0.97 * night})`);
      sky.addColorStop(0.6, `rgba(10, 12, 40, ${0.9 * night})`);
      sky.addColorStop(1, `rgba(30, 30, 70, ${0.75 * night})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      starMul = Math.max(0, (night - 0.45) / 0.55);
      if (starMul > 0) drawStars(t);
      starMul = 1;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (day) {
        drawDay();
        drawDusk(t);
      } else drawNight(t);
      if (!planetRef.current) return;
      drawSun(t);
    };

    const drawNight = (t: number) => {
      // nebula haze
      for (const [fx, fy, rr, col, a] of [
        [0.15, 0.12, 0.55, accent, 0.05],
        [0.85, 0.3, 0.45, "#b18cff", 0.035],
      ] as const) {
        const g = ctx.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, w * rr);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      // Milky Way glow: a long soft streak behind the dust
      ctx.save();
      ctx.translate(w / 2, h * 0.52);
      ctx.rotate(-Math.atan2(h * 0.75, w));
      ctx.scale(1, 0.12);
      const mw = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.75);
      mw.addColorStop(0, `rgba(220, 210, 255, ${planetRef.current ? 0.09 : 0.2})`);
      mw.addColorStop(0.4, rgba("#b18cff", planetRef.current ? 0.04 : 0.1));
      mw.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = mw;
      ctx.fillRect(-w, -w, w * 2, w * 2);
      ctx.restore();
      for (const s of band) {
        ctx.globalAlpha = (0.15 + s.depth * 0.7) * (0.6 + 0.4 * Math.sin(s.phase + (t / 1000) * s.speed));
        ctx.fillStyle = "#e6e2ff";
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      drawStars(t);
      drawWarp();
      // occasional shooting star
      if (!calm()) {
        const cycle = (t / 1000) % 7;
        if (cycle < 0.9) {
          const k = Math.floor(t / 7000);
          const sx = (((k * 73) % 100) / 100) * w;
          const sy = (((k * 37) % 40) / 100) * h;
          const p = cycle / 0.9;
          const hx = sx + p * w * 0.25;
          const hy = sy + p * h * 0.12;
          const tail = ctx.createLinearGradient(hx - w * 0.08, hy - h * 0.04, hx, hy);
          tail.addColorStop(0, "rgba(255, 255, 255, 0)");
          tail.addColorStop(1, `rgba(255, 255, 255, ${0.9 * (1 - p)})`);
          ctx.strokeStyle = tail;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(hx - w * 0.08, hy - h * 0.04);
          ctx.lineTo(hx, hy);
          ctx.stroke();
        }
      }
    };

    const drawSun = (t: number) => {
      // must match the 3D EarthHorizon rim (~64% down the viewport)
      const cx = w / 2;
      const top = h * HORIZON;

      // the sun starts set below the rim and rises as the reader scrolls down
      const rise = Math.min(1, window.scrollY / (h * 1.2));
      sunUp += ((day ? daySun() : rise) - sunUp) * (calm() ? 1 : 0.06);
      const ease = 1 - (1 - sunUp) ** 2;
      const sunY = top + 40 - ease * 120;
      const sunX = cx + w * 0.12;
      const glare = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * (0.25 + ease * 0.75));
      glare.addColorStop(0, `rgba(255, 250, 235, ${0.9 * ease})`);
      glare.addColorStop(0.08, `rgba(255, 226, 170, ${0.55 * ease})`);
      glare.addColorStop(0.35, rgba(accent, 0.18 * ease));
      glare.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glare;
      ctx.fillRect(0, 0, w, h);
      // horizontal lens streak
      const streak = ctx.createLinearGradient(sunX - w * 0.5, 0, sunX + w * 0.5, 0);
      streak.addColorStop(0, "rgba(255, 255, 255, 0)");
      streak.addColorStop(0.5, `rgba(255, 245, 225, ${0.5 * ease})`);
      streak.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = streak;
      ctx.fillRect(sunX - w * 0.5, sunY - 1, w, 2);
      if (ease > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        // corona: white-hot core fading through gold to orange
        const corona = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 90 + ease * 60);
        corona.addColorStop(0, `rgba(255, 255, 255, ${ease})`);
        corona.addColorStop(0.12, `rgba(255, 248, 225, ${0.95 * ease})`);
        corona.addColorStop(0.3, `rgba(255, 214, 140, ${0.45 * ease})`);
        corona.addColorStop(0.6, `rgba(255, 150, 60, ${0.15 * ease})`);
        corona.addColorStop(1, "rgba(255, 120, 40, 0)");
        ctx.fillStyle = corona;
        ctx.fillRect(sunX - 160, sunY - 160, 320, 320);
        // diffraction rays, slowly turning, uneven lengths
        const turn = t / 40000;
        for (let i = 0; i < 16; i++) {
          const a = turn + (i / 16) * Math.PI * 2;
          const len = (i % 2 ? 70 : 150) * (0.7 + 0.3 * Math.sin(i * 2.3 + t / 1500)) * (0.4 + ease * 0.8);
          const ray = ctx.createLinearGradient(sunX, sunY, sunX + Math.cos(a) * len, sunY + Math.sin(a) * len);
          ray.addColorStop(0, `rgba(255, 245, 220, ${0.55 * ease})`);
          ray.addColorStop(1, "rgba(255, 245, 220, 0)");
          ctx.strokeStyle = ray;
          ctx.lineWidth = i % 2 ? 1 : 2;
          ctx.beginPath();
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(sunX + Math.cos(a) * len, sunY + Math.sin(a) * len);
          ctx.stroke();
        }
        // photosphere
        ctx.shadowColor = "rgba(255, 230, 170, 1)";
        ctx.shadowBlur = 40;
        ctx.fillStyle = `rgba(255, 255, 250, ${ease})`;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 11 + ease * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // lens-flare ghosts along the line through the screen centre
        const dx = w / 2 - sunX;
        const dy = h / 2 - sunY;
        for (const [k, r, col] of [
          [0.5, 26, "120, 160, 255"],
          [0.9, 14, "180, 255, 200"],
          [1.4, 46, "255, 170, 120"],
          [1.8, 18, "200, 150, 255"],
        ] as const) {
          const gx = sunX + dx * k;
          const gy = sunY + dy * k;
          const ghost = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
          ghost.addColorStop(0, `rgba(${col}, ${0.12 * ease})`);
          ghost.addColorStop(0.7, `rgba(${col}, ${0.06 * ease})`);
          ghost.addColorStop(1, `rgba(${col}, 0)`);
          ctx.fillStyle = ghost;
          ctx.beginPath();
          ctx.arc(gx, gy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const still = () => draw(0);
    // pauses while the tab is hidden; reduced motion and focus mode get one still frame per change
    const start = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (document.hidden) return;
      if (calm()) still();
      else raf = requestAnimationFrame(loop);
    };
    const onResize = () => {
      seed();
      if (calm()) still();
    };
    const onScroll = () => {
      if (calm()) still();
    };

    theme();
    seed();
    start();
    const mo = new MutationObserver(() => {
      theme();
      start(); // focus mode / theme toggles switch between the live loop and a still frame
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    reduce.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    return () => {
      document.removeEventListener("visibilitychange", start);
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      reduce.removeEventListener("change", start);
    };
  }, [frozen]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 size-full" />;
}
