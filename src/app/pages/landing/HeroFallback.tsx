/**
 * Static stand-in for the 3D Earth: used while the three.js chunk loads, when WebGL
 * is missing, the import fails or the context is lost. Same box, so zero layout shift.
 */
export function HeroFallback() {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-[18%] size-[64%]" fill="none">
      <defs>
        <radialGradient id="hero-earth" cx="68%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#3b7bd0" />
          <stop offset="45%" stopColor="#0d3a78" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <radialGradient id="hero-atmo" cx="50%" cy="50%" r="50%">
          <stop offset="88%" stopColor="#6d8dff" stopOpacity="0" />
          <stop offset="96%" stopColor="#8fb0ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#8fb0ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#hero-atmo)" />
      <circle cx="100" cy="100" r="86" fill="url(#hero-earth)" />
      <path
        d="M120 50c14 4 26 16 28 30-8-2-14 4-22 2s-10-12-18-14 0-20 12-18zM60 96c10-6 24-2 28 8s-6 22-16 26-20-4-22-14 2-16 10-20z"
        fill="#2c5a2a"
        opacity="0.8"
      />
    </svg>
  );
}
