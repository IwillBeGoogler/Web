import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Clock,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
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
import { useReducedMotion } from "@/shared/motion";
import { HeroFallback } from "./HeroFallback";

/** Uniform points on a spherical shell r in [r0, r1]. */
function shell(n: number, r0: number, r1: number) {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.cbrt(r0 ** 3 + Math.random() * (r1 ** 3 - r0 ** 3));
    const s = Math.sqrt(1 - u * u);
    a.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
  }
  return a;
}

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
 * Photoreal Earth after franky-adl/threejs-earth (MIT): NASA albedo, bump, ocean glint, night lights on the
 * dark side, clouds that cast shadows, and an additive atmosphere halo. Turns on a tilted axis; scroll adds spin.
 * Decorative only.
 */
export default function HeroScene() {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  const reduceRef = useRef(reduce);
  const api = useRef<{ setReduce: (r: boolean) => void } | null>(null);

  useEffect(() => {
    reduceRef.current = reduce;
    api.current?.setReduce(reduce);
  }, [reduce]);

  useEffect(() => {
    const el = box.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const mobile = innerWidth < 768;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    const attrs: WebGLContextAttributes & { powerPreference: "low-power" } = { antialias: dpr < 2, alpha: true, powerPreference: "low-power" };
    // three r163+ is WebGL2-only. Probe on the real canvas so only one context ever exists.
    let context: WebGL2RenderingContext | null = null;
    try {
      context = canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null;
    } catch {
      context = null;
    }
    if (!context) {
      setFailed(true);
      return;
    }
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, context, ...attrs });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = SRGBColorSpace;

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 0, 6.5);
    camera.lookAt(0, 0, 0);

    // Sun from the upper right, matching the sunrise glow of the page background.
    // Sun starts set behind the planet (night side faces us, cities lit) and swings round as the page scrolls.
    const sunLight = new DirectionalLight(0xffffff, 1.6);
    const sunSet = new Vector3(-1.5, -0.6, -5);
    const sunUp = new Vector3(4, 1.6, 2.5);
    let sunMix = Math.min(1, scrollY / innerHeight);
    const placeSun = () => sunLight.position.lerpVectors(sunSet, sunUp, 1 - (1 - sunMix) ** 2);
    placeSun();
    scene.add(sunLight, new AmbientLight(0xffffff, 0.04));

    const group = new Group();
    group.rotation.z = (23.5 * Math.PI) / 180; // axial tilt
    scene.add(group);

    const loader = new TextureLoader();
    const load = (name: string) => loader.loadAsync(`${TEX}${name}.webp`);

    const seg = mobile ? 64 : 96;
    const earthGeo = new SphereGeometry(1.45, seg, seg);
    const earthMat = new MeshStandardMaterial({ bumpScale: 0.03, metalness: 0.1, emissive: new Color(0xffff88) });
    const earth = new Mesh(earthGeo, earthMat);
    earth.rotation.y = -0.3;
    group.add(earth);

    const cloudGeo = new SphereGeometry(1.46, seg, seg);
    const cloudMat = new MeshStandardMaterial({ transparent: true });
    const clouds = new Mesh(cloudGeo, cloudMat);
    clouds.rotation.y = -0.3;
    group.add(clouds);

    const atmoGeo = new SphereGeometry(1.8, 64, 64);
    const atmoMat = new ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { atmOpacity: { value: 0.7 }, atmPowFactor: { value: 4.1 }, atmMultiplier: { value: 9.5 } },
      blending: AdditiveBlending,
      side: BackSide,
    });
    group.add(new Mesh(atmoGeo, atmoMat));

    const cloudOffset = { value: 0 };
    let textures: Texture[] = [];
    let ready = false;
    Promise.all(["albedo", "bump", "clouds", "ocean", "lights"].map(load))
      .then(([albedo, bump, cloudTex, ocean, lights]) => {
        if (!albedo || !bump || !cloudTex || !ocean || !lights) return;
        textures = [albedo, bump, cloudTex, ocean, lights];
        albedo.colorSpace = SRGBColorSpace;
        for (const t of textures) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
              float intensity = 1.4 - dot(nonPerturbedNormal, vec3(0.0, 0.0, 1.0));
              diffuseColor.rgb += vec3(0.3, 0.6, 1.0) * pow(intensity, 5.0);`,
            );
        };
        earthMat.needsUpdate = true;
        cloudMat.alphaMap = cloudTex;
        cloudMat.needsUpdate = true;
        ready = true;
        if (!running) render();
      })
      .catch(() => setFailed(true));

    const ptsGeo = new BufferGeometry();
    ptsGeo.setAttribute("position", new BufferAttribute(shell(mobile ? 420 : 900, 2.8, 4.4), 3));
    const ptsMat = new PointsMaterial({ color: 0xdfe4ff, size: 0.016, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false });
    const points = new Points(ptsGeo, ptsMat);
    scene.add(points);

    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!running) render();
    };
    const ro = new ResizeObserver(resize);

    // Parallax targets.
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      target.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      target.x = Math.max(-1, Math.min(1, e.gamma / 45));
      target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
    };

    const clock = new Clock();
    let t = 0;
    let raf = 0;
    let running = false;
    let visible = true;
    let first = true;
    let lost = false;
    let lastScroll = scrollY;

    const render = () => {
      if (!ready) return;
      renderer.render(scene, camera);
      if (first) {
        first = false;
        setShown(true);
      }
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;
      // clouds drift twice as fast as the ground; scroll adds spin to both
      const spin = 0.01 * dt;
      earth.rotation.y += spin + (scrollY - lastScroll) / 700;
      clouds.rotation.y += spin * 2 + (scrollY - lastScroll) / 700;
      cloudOffset.value = (cloudOffset.value + spin / (2 * Math.PI)) % 1;
      lastScroll = scrollY;
      sunMix += (Math.min(1, scrollY / innerHeight) - sunMix) * 0.06;
      placeSun();
      points.rotation.y += 0.01 * dt;
      group.position.y = 0.06 * Math.sin(t * 0.5);
      camera.position.x += (target.x * 0.4 - camera.position.x) * 0.05;
      camera.position.y += (-target.y * 0.3 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
      render();
    };
    const start = () => {
      if (running || lost || reduceRef.current || !visible || document.hidden) return;
      running = true;
      clock.getDelta(); // discard the paused gap
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const still = () => {
      stop();
      earth.rotation.y = -0.3;
      clouds.rotation.y = -0.3;
      group.position.y = 0;
      camera.position.set(0, 0, 6.5);
      camera.lookAt(0, 0, 0);
      render();
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    const onVis = () => (document.hidden ? stop() : start());
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stop();
      setFailed(true);
    };

    resize();
    ro.observe(el);
    io.observe(el);
    document.addEventListener("visibilitychange", onVis);
    canvas.addEventListener("webglcontextlost", onLost);
    addEventListener("pointermove", onPointer, { passive: true });
    addEventListener("deviceorientation", onTilt, { passive: true });

    api.current = {
      setReduce: (r) => {
        if (r) still();
        else start();
      },
    };
    if (reduceRef.current) still();
    else start();

    return () => {
      api.current = null;
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      removeEventListener("pointermove", onPointer);
      removeEventListener("deviceorientation", onTilt);
      for (const t of textures) t.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      ptsGeo.dispose();
      ptsMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0">
      {failed || !shown ? <HeroFallback /> : null}
      {failed ? null : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full transition-[opacity,transform] duration-[900ms] [transition-timing-function:var(--ease-out)]"
          style={{ opacity: shown ? 1 : 0, transform: shown ? "scale(1)" : "scale(0.85)" }}
        />
      )}
    </div>
  );
}
