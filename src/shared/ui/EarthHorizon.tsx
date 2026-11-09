import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  LineLoop,
  LoadingManager,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { closestT, FLYBY_EVERY, FLYBY_SECONDS, ORBITS, orbitPoint } from "./satellite/orbit";
import { createSatellite } from "./satellite/satelliteModel";
import { shakePage, stopShake } from "./satellite/shake";

/** Atmosphere halo, from franky-adl/threejs-earth (MIT): https://github.com/franky-adl/threejs-earth */
const ATMO_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 eyeVector;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  eyeVector = normalize(mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;
const ATMO_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 eyeVector;
uniform float atmOpacity;
uniform float atmPowFactor;
uniform float atmMultiplier;
void main() {
  float dotP = dot(vNormal, eyeVector);
  float factor = pow(dotP, atmPowFactor) * atmMultiplier;
  vec3 atmColor = vec3(0.35 + dotP / 4.5, 0.35 + dotP / 4.5, 1.0);
  gl_FragColor = vec4(atmColor, atmOpacity) * factor;
}
`;

const TEX = `${import.meta.env.BASE_URL}earth/`;

/**
 * Photoreal Earth filling the bottom of the viewport, after franky-adl/threejs-earth (MIT):
 * NASA albedo (Blue Marble, public domain, 16k on capable desktops), bump, ocean glint, city lights on the night side, cloud shadows, atmosphere.
 * The sun starts set behind it and comes up as the page scrolls; scrolling also turns the planet.
 * With `satellite` (and `brand` printed on its wing), every 30s a satellite comes in from the side on a straight
 * line just past the camera, while a small constellation circles the planet on orbits of its own; the page's components shiver as it goes by (the sky stays still), then it is gone.
 * Fixed, decorative, behind everything.
 */
export default function EarthHorizon({ brand, satellite = false }: { brand?: string; satellite?: boolean }) {
  const brandRef = useRef(brand);
  const satOn = useRef(satellite);
  satOn.current = satellite;
  const ref = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0); // 0..1 while textures stream in; the planet fades in at 1

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = innerWidth < 768;
    const attrs: WebGLContextAttributes & { powerPreference: "low-power" } = { antialias: true, alpha: true, powerPreference: "low-power" };
    const context = canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null;
    if (!context) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, context, ...attrs });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.outputColorSpace = SRGBColorSpace;

    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);

    // Set: behind and below the planet, only the limb catches light and cities glow.
    // Up: high over the shoulder, the visible cap goes to day.
    const sun = new DirectionalLight(0xffffff, 1.7);
    // Rim lands at ~64% of the viewport height; Galaxy's HORIZON matches it.
    const sunSet = new Vector3(4, -8, -40);
    const sunUp = new Vector3(8, 14, 6);
    let sunMix = 0;
    scene.add(sun, new AmbientLight(0xffffff, 0.03));

    const group = new Group();
    group.position.set(0, -11.5, -14);
    group.rotation.z = (23.5 * Math.PI) / 180;
    group.rotation.x = 0.35; // lean the north pole toward us so continents, not the ice cap, face the camera
    scene.add(group);

    const seg = mobile ? 96 : 160;
    const earthGeo = new SphereGeometry(10, seg, seg);
    const earthMat = new MeshStandardMaterial({ bumpScale: 0.03, metalness: 0.1, emissive: new Color(0xffff88) });
    const earth = new Mesh(earthGeo, earthMat);
    group.add(earth);
    const cloudGeo = new SphereGeometry(10.05, seg, seg);
    const cloudMat = new MeshStandardMaterial({ transparent: true });
    const clouds = new Mesh(cloudGeo, cloudMat);
    group.add(clouds);
    const atmoGeo = new SphereGeometry(12.5, 96, 96);
    const atmoMat = new ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { atmOpacity: { value: 0.7 }, atmPowFactor: { value: 4.1 }, atmMultiplier: { value: 9.5 } },
      blending: AdditiveBlending,
      side: BackSide,
    });
    group.add(new Mesh(atmoGeo, atmoMat));

    // Satellite flyby: every FLYBY_EVERY seconds it enters from beyond the left edge, flies a straight line
    // just in front of the camera and leaves past the right edge, behind us. Hidden otherwise.
    const center = new Vector3(0, -11.5, -14);
    const from = new Vector3(-7, 0.6, -7);
    const to = new Vector3(4, -0.5, 1.5);
    const closest = closestT(from, to);
    const brand = brandRef.current;
    const pmrem = brand ? new PMREMGenerator(renderer) : null;
    const env = pmrem ? pmrem.fromScene(new RoomEnvironment(), 0.04).texture : null;
    const sat = brand ? createSatellite(brand, env) : null;
    if (sat) {
      sat.object.scale.setScalar(0.09);
      sat.object.visible = false;
      scene.add(sat.object);
      // earthshine: soft blue fill from the planet onto the side that faces it
      const shine = new PointLight(0x7fa6ff, 0.45, 0, 0);
      shine.position.copy(center);
      scene.add(shine);
    }
    // Background constellation: smaller copies (shared geometry and materials) on their own orbits.
    const up = new Vector3(0, 1, 0.55).normalize();
    // faint orbit tracks; depth-tested so the planet hides the far side of each ring
    const trackMat = new LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.22, depthWrite: false });
    const tracks = sat
      ? ORBITS.map((orbit) => {
          const pts: Vector3[] = [];
          const lap = Math.abs(orbit.period);
          for (let i = 0; i < 256; i++) {
            const p = orbitPoint(orbit, (lap * i) / 256, up);
            pts.push(new Vector3(center.x + p.x, center.y + p.y, center.z + p.z));
          }
          const line = new LineLoop(new BufferGeometry().setFromPoints(pts), trackMat);
          line.visible = false;
          scene.add(line);
          return line;
        })
      : [];
    // fleet materials: copies of the model's with a little self-light, so the small craft still read
    // against the night sky when they are on the planet's shadowed side
    const fleetMats = new Map<Material, Material>();
    const lift = (m: Material) => {
      let c = fleetMats.get(m);
      if (!c) {
        c = m.clone();
        if (c instanceof MeshStandardMaterial) {
          c.emissive.setScalar(1);
          c.emissiveMap = c.map;
          c.emissiveIntensity = c.map ? 0.35 : 0.12;
        }
        fleetMats.set(m, c);
      }
      return c;
    };
    const fleet = sat
      ? ORBITS.map((orbit) => {
          const o = sat.object.clone();
          o.scale.setScalar(orbit.size);
          o.traverse((n) => {
            if (n instanceof Mesh) n.material = Array.isArray(n.material) ? n.material.map(lift) : lift(n.material);
          });
          o.visible = false;
          scene.add(o);
          return { orbit, o };
        })
      : [];
    let clockT = 0;
    const moveFleet = (dt: number) => {
      clockT += dt;
      for (const t of tracks) t.visible = satOn.current;
      for (const { orbit, o } of fleet) {
        o.visible = satOn.current;
        if (!o.visible) continue;
        const p = orbitPoint(orbit, clockT, up);
        o.position.set(center.x + p.x, center.y + p.y, center.z + p.z);
        o.lookAt(center);
      }
    };
    let roll = 0;
    let fly = -1; // flyby progress 0–1, or -1 when gone
    // seconds since the last flyby ended; primed so the first one comes ~4s after load
    let rest = FLYBY_EVERY - FLYBY_SECONDS - 4;
    const moveSat = (dt: number) => {
      if (!sat) return;
      if (!satOn.current) {
        fly = -1;
        sat.object.visible = false;
        return;
      }
      // one flyby every FLYBY_EVERY seconds, start to start
      if (fly < 0) {
        rest += dt;
        if (rest >= FLYBY_EVERY - FLYBY_SECONDS) fly = 0;
      } else {
        const prev = fly;
        fly += dt / FLYBY_SECONDS;
        if (prev < closest && fly >= closest) shakePage();
        if (fly >= 1) {
          fly = -1;
          rest = 0;
        }
      }
      const o = sat.object;
      o.visible = fly >= 0;
      if (fly < 0) return;
      roll += 0.25 * dt;
      o.position.lerpVectors(from, to, fly);
      o.lookAt(center);
      o.rotateZ(roll);
    };

    const cloudOffset = { value: 0 };
    let textures: Texture[] = [];
    let fading = false;
    let raf = 0;
    let disposed = false;
    const kick = () => {
      if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(frame);
    };
    // Until the textures land only the atmosphere glow renders; the planet body fades in once complete.
    // The dark body stays in place so the halo reads as a horizon, not a glowing disc.
    earthMat.color.setScalar(0);
    clouds.visible = false;
    group.visible = false; // without its maps the planet is a white ball and a hollow halo: hidden until they load (or for good if they fail)
    const manager = new LoadingManager();
    manager.onProgress = (_url, done, total) => setProgress(total ? done / total : 0);
    const loader = new TextureLoader(manager);
    // phones get 2048px maps (~0.8 MB) instead of the 4-8K desktop set (~4.4 MB)
    const dir = mobile ? `${TEX}sm/` : TEX;
    // Desktop GPUs that take 16k textures get the NASA Blue Marble at 16000px for a sharp close-up horizon.
    const big = !mobile && renderer.capabilities.maxTextureSize >= 16384;
    const file = (n: string) => (n === "albedo" && big ? "albedo-16k" : n);
    Promise.all(["albedo", "bump", "clouds", "ocean", "lights"].map((n) => loader.loadAsync(`${dir}${file(n)}.webp`)))
      .then(([albedo, bump, cloudTex, ocean, lights]) => {
        if (disposed || !albedo || !bump || !cloudTex || !ocean || !lights) return;
        textures = [albedo, bump, cloudTex, ocean, lights];
        albedo.colorSpace = SRGBColorSpace;
        for (const t of textures) t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        cloudTex.wrapS = RepeatWrapping;
        earthMat.map = albedo;
        earthMat.bumpMap = bump;
        earthMat.roughnessMap = ocean;
        earthMat.metalnessMap = ocean;
        earthMat.emissiveMap = lights;
        // Ocean map is white on water: invert it for roughness, light cities only on the night side,
        // shade the ground under clouds, and tint the limb blue.
        earthMat.onBeforeCompile = (shader) => {
          shader.uniforms.tClouds = { value: cloudTex };
          shader.uniforms.uv_xOffset = cloudOffset;
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform sampler2D tClouds;\nuniform float uv_xOffset;")
            .replace(
              "#include <roughnessmap_fragment>",
              `float roughnessFactor = roughness;
              #ifdef USE_ROUGHNESSMAP
                vec4 texelRoughness = vec4(1.0) - texture2D(roughnessMap, vRoughnessMapUv);
                roughnessFactor *= clamp(texelRoughness.g, 0.5, 1.0);
              #endif`,
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#ifdef USE_EMISSIVEMAP
                vec4 emissiveColor = texture2D(emissiveMap, vEmissiveMapUv);
                emissiveColor *= 1.0 - smoothstep(-0.02, 0.0, dot(nonPerturbedNormal, directionalLights[0].direction));
                totalEmissiveRadiance *= emissiveColor.rgb;
              #endif
              float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
              diffuseColor.rgb *= max(1.0 - cloudsMapValue, 0.2);
              // limb haze from the real view direction (the cap faces up, not at the camera,
              // so the original z-axis test washed the whole visible surface blue)
              float limb = 1.0 - max(dot(nonPerturbedNormal, normalize(vViewPosition)), 0.0);
              diffuseColor.rgb += vec3(0.3, 0.6, 1.0) * pow(limb, 6.0) * 0.6;`,
            );
        };
        earthMat.needsUpdate = true;
        cloudMat.alphaMap = cloudTex;
        cloudMat.needsUpdate = true;
        clouds.visible = true;
        group.visible = true;
        cloudMat.opacity = 0;
        fading = true;
        setProgress(1);
        dispatchEvent(new Event("iwillbegoogler:earth-ready")); // lets the loading splash lift
        kick();
      })
      .catch(() => undefined);

    const resize = () => {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };

    let spin = 0;
    let last = performance.now();
    // Loops only while visible and motion is allowed; reduced motion renders one still frame per change.
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (!reduce.matches) raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (fading) {
        // brighten the surface in from black over ~1.2s
        const o = reduce.matches ? 1 : Math.min(1, cloudMat.opacity + dt / 1.2);
        earthMat.color.setScalar(o);
        earthMat.emissiveIntensity = o;
        cloudMat.opacity = o;
        if (o >= 1) fading = false;
      }
      const still = reduce.matches;
      // daylight theme: the sun is up, then sets over the last ~1.2 screens so the planet goes dark at the page end.
      // dark theme: the sun starts set and rises over the first ~1.2 screens.
      const day = !document.documentElement.classList.contains("dark");
      const left = document.documentElement.scrollHeight - innerHeight - scrollY;
      const target = day ? Math.max(0, Math.min(1, left / (innerHeight * 1.2))) : Math.min(1, scrollY / (innerHeight * 1.2));
      sunMix += (target - sunMix) * (still ? 1 : 0.06);
      sun.position.lerpVectors(sunSet, sunUp, 1 - (1 - sunMix) ** 2);
      const scrollSpin = scrollY / 1500;
      spin += (scrollSpin - spin) * (still ? 1 : 0.08);
      const drift = still ? 0 : dt * 0.004;
      earth.rotation.y = spin - 1.2;
      // clouds drift ahead of the ground; the shadow lookup uses the same offset
      cloudOffset.value = (cloudOffset.value + drift / (2 * Math.PI)) % 1;
      clouds.rotation.y = earth.rotation.y + cloudOffset.value * 2 * Math.PI;
      if (!still) {
        moveSat(dt);
        moveFleet(dt);
      }
      renderer.render(scene, camera);
    };

    const onResize = () => {
      resize();
      kick();
    };
    resize();
    addEventListener("resize", onResize);
    addEventListener("scroll", kick, { passive: true });
    document.addEventListener("visibilitychange", kick);
    reduce.addEventListener("change", kick);
    const mo = new MutationObserver(kick);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    kick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      removeEventListener("scroll", kick);
      document.removeEventListener("visibilitychange", kick);
      reduce.removeEventListener("change", kick);
      mo.disconnect();
      for (const t of textures) t.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      for (const t of tracks) t.geometry.dispose();
      trackMat.dispose();
      for (const m of fleetMats.values()) m.dispose();
      sat?.dispose();
      env?.dispose();
      pmrem?.dispose();
      stopShake();
      renderer.dispose();
      // StrictMode re-runs this effect on the same canvas in dev: a lost context could not be used again
      if (!import.meta.env.DEV) renderer.forceContextLoss();
    };
  }, []);

  return (
    <>
      <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 size-full" />
      {progress < 1 ? (
        <div
          role="progressbar"
          aria-label="Loading Earth"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="pointer-events-none fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-white/80 uppercase backdrop-blur-md"
        >
          <svg viewBox="0 0 20 20" className="size-4 -rotate-90" aria-hidden>
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${progress * 50.3} 50.3`}
              className="transition-[stroke-dasharray] duration-300"
            />
          </svg>
          Earth {Math.round(progress * 100)}%
        </div>
      ) : null}
      {/* scrim: keeps text near the bright horizon readable in both themes */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[35vh] bg-gradient-to-t from-surface/35 via-surface/10 to-transparent" />
    </>
  );
}
