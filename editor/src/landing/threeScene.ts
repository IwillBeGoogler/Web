// The three.js hero scene: "living system architecture". Loaded with a dynamic import (see HeroScene) so three never lands in the entry chunk.
import {
  AdditiveBlending, AmbientLight, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Group,
  Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, NormalBlending, PerspectiveCamera, PlaneGeometry, PointLight, Scene,
  SRGBColorSpace, Sprite, SpriteMaterial, Vector2, Vector3, WebGLRenderer, Texture, Shape, ShapeGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { resolveIcon } from '../data/icons';
import { CAM_Z, FOV_DESKTOP, FOV_MOBILE, fitTiltedBox, viewSize, type Box } from './cameraMap';
import { buildHeroLayout, dashPolyline, labelAnchor, packetCount, ribbon, TILE, type Pt } from './heroLayout';
import { GENERIC_ICONS } from '../data/icons/generic';

/** a soft, blurred rounded-rect: the drop shadow under a tile */
function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.filter = 'blur(7px)';
    g.fillStyle = '#000';
    g.beginPath();
    g.roundRect(30, 30, 68, 68, 16);
    g.fill();
  }
  return new CanvasTexture(c);
}

/** a crisp filled dot with a hairline feather (packet core) */
function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.72, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return new CanvasTexture(c);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** brand SVG from our own icon catalog, drawn on a light rounded tile -> CanvasTexture (null when the icon is not a brand logo) */
async function logoTexture(iconId: string, plate: boolean): Promise<CanvasTexture | null> {
  try {
    const icon = await resolveIcon(iconId);
    if (icon.kind === 'generic') return genericTexture(iconId, plate);
    if (icon.kind !== 'brand') return null;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="256" height="256">${icon.body}</svg>`;
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('logo decode failed'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    if (plate) {
      g.fillStyle = 'rgba(255,255,255,0.94)';
      g.beginPath();
      g.roundRect(10, 10, 236, 236, 44);
      g.fill();
    }
    const vb = icon.viewBox.split(/[\s,]+/).map(Number);
    const ar = vb[3] > 0 ? vb[2] / vb[3] : 1;
    const w = ar >= 1 ? 168 : 168 * ar;
    const h = ar >= 1 ? 168 / ar : 168;
    g.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

/** generic (stroke-only) glyphs such as "users": drawn with Path2D on the same light plate as brand logos */
function genericTexture(iconId: string, plate: boolean): CanvasTexture | null {
  const g = GENERIC_ICONS[iconId];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  if (!g || !ctx || typeof Path2D === 'undefined') return null;
  if (plate) {
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 236, 44);
    ctx.fill();
  }
  ctx.translate(44, 44);
  ctx.scale(168 / 24, 168 / 24);
  ctx.strokeStyle = `#${g.hex}`;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of g.paths) ctx.stroke(new Path2D(d));
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function sampler(pts: Vector3[]) {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[lens.length - 1] || 1;
  return {
    total,
    at: (d: number, out: Vector3) => {
      const dd = Math.min(Math.max(d, 0), total);
      let i = 1;
      while (i < lens.length - 1 && lens[i] < dd) i++;
      const seg = lens[i] - lens[i - 1] || 1;
      return out.lerpVectors(pts[i - 1], pts[i], (dd - lens[i - 1]) / seg);
    },
  };
}

/** closed rounded-rect outline, centred on (cx, cy) */
function roundedRect(cx: number, cy: number, w: number, h: number, r: number, steps = 6): Pt[] {
  const out: Pt[] = [];
  const corner = (ox: number, oy: number, a0: number) => {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2);
      out.push({ x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r });
    }
  };
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  corner(x1 - r, y0 + r, Math.PI * 1.5);
  out.push({ ...out[0] });
  return out;
}

function ribbonGeometry(polys: Pt[][], width: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const p of polys) {
    const r = ribbon(p, width);
    const base = pos.length / 3;
    pos.push(...r.positions);
    idx.push(...r.indices.map((i) => i + base));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export interface LandingSceneOptions {
  canvas: HTMLCanvasElement;
  /** element that receives the tile labels (positioned over the canvas, which fills it) */
  host?: HTMLElement;
  width: number;
  height: number;
  mobile: boolean;
  dark: boolean;
  accent: string;
  /** free area (px, canvas coordinates) the scene is fitted into; defaults to the whole canvas */
  fitBox?: Box;
  /** false in tests: skip the (async) brand-logo textures */
  logos?: boolean;
}
export interface LandingScene {
  render: (t: number) => void;
  resize: (w: number, h: number, fitBox?: Box) => void;
  setPointer: (x: number, y: number) => void;
  dispose: () => void;
  stats: { nodes: number; edges: number; packets: number; renderers: number };
}

const LINE_PX = 1.5; // connector width, CSS px
const TRAIL = 4;

/** The hero scene: one renderer, a tidy tiered architecture on a tilted plane, fitted into the free area so nothing can clip or collide. */
export async function createLandingScene(o: LandingSceneOptions): Promise<LandingScene> {
  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(o.width, o.height, false);
  renderer.setClearColor(0x000000, 0);
  const fov = o.mobile ? FOV_MOBILE : FOV_DESKTOP;

  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, o.width / o.height, 0.1, 80);
  camera.position.set(0, 0, CAM_Z);
  let vw = o.width;
  let vh = o.height;
  let fitBox: Box = o.fitBox ?? { left: 0, top: 0, width: o.width, height: o.height };

  const accent = new Color(o.accent);
  scene.add(new AmbientLight(0xffffff, o.dark ? 0.9 : 1.4));
  const key = new PointLight(accent, o.dark ? 90 : 0, 40, 1.4);
  key.position.set(-4, 5, 8);
  scene.add(key);
  const fill = new PointLight(0xffffff, o.dark ? 40 : 0, 40, 1.6);
  fill.position.set(6, -3, 7);
  scene.add(fill);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => (disposables.push(x), x);
  const glowTex = track(glowTexture());
  const dotTex = track(dotTexture());
  const shadowTex = track(shadowTexture());

  /* ---------------- hero: a tidy architecture on a tilted plane ---------------- */
  const layout = buildHeroLayout(o.mobile ? 'phone' : 'desktop');
  const hero = new Group(); // pinned + tilted
  hero.rotation.order = 'YXZ'; // matches the projection maths in fitTiltedBox
  scene.add(hero);
  const plane = new Group(); // layout coordinates, centred on the bounds
  hero.add(plane);
  const bw = layout.bounds.x1 - layout.bounds.x0;
  const bh = layout.bounds.y1 - layout.bounds.y0;
  plane.position.set(-(layout.bounds.x0 + layout.bounds.x1) / 2, -(layout.bounds.y0 + layout.bounds.y1) / 2, 0);
  const YAW = -0.21; // ~-12 deg
  const ELEV = -0.26; // ~15 deg looking down on the plane
  const FILL = 0.9; // the plane takes this share of the free area (leaves air around it)

  // theme-aware surfaces: light = white glass tile, 1px slate border, soft shadow; dark = deep indigo glass
  const depth = o.dark ? 0.3 : 0.14;
  const rimColor = new Color(o.dark ? o.accent : 0xcbd3df);
  const cubeGeo = track(new RoundedBoxGeometry(TILE, TILE, depth, 3, 0.16));
  const borderGeo = track(new BufferGeometry().setFromPoints(roundedRect(0, 0, TILE, TILE, 0.16).map((q) => new Vector3(q.x, q.y, 0))));
  const logoGeo = track(new PlaneGeometry(TILE * 0.7, TILE * 0.7));
  const iconIds = [...new Set([...layout.tiles.map((t) => t.icon), ...layout.plates.map((p) => p.icon)])];
  const texByIcon = new Map<string, Texture | null>();
  if (o.logos === false) iconIds.forEach((i) => texByIcon.set(i, null));
  else (await Promise.all(iconIds.map((i) => logoTexture(i, o.dark)))).forEach((t, k) => { if (t) track(t); texByIcon.set(iconIds[k], t); });

  // the cloud boundary (a VPC): faint tint + solid hairline behind services and data, never a floating tile
  const lines: { mesh: Mesh; polys: Pt[][] }[] = [];
  const addLine = (polys: Pt[][], color: number | Color, opacity: number, z: number, parent: Group = plane) => {
    const mesh = new Mesh(track(ribbonGeometry(polys, 0.03)), track(new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false, fog: false })));
    mesh.position.z = z;
    parent.add(mesh);
    lines.push({ mesh, polys });
    return mesh;
  };
  for (const pl of layout.plates) {
    const w = pl.width, h = pl.height;
    const outline = roundedRect(pl.x, pl.y, w, h, 0.4, 8);
    const shape = new Shape(outline.map((q) => new Vector2(q.x, q.y)));
    const fillMesh = new Mesh(track(new ShapeGeometry(shape)), track(new MeshBasicMaterial({ color: accent, transparent: true, opacity: o.dark ? 0.07 : 0.045, depthWrite: false, fog: false })));
    fillMesh.position.z = -0.25;
    plane.add(fillMesh);
    addLine([outline], accent, o.dark ? 0.5 : 0.38, -0.24); // solid hairline: dashes are reserved for the observability flows
    const tex = texByIcon.get(pl.icon);
    if (tex) {
      const badge = new Mesh(track(new PlaneGeometry(0.8, 0.8)), track(new MeshBasicMaterial({ map: tex, transparent: true, fog: false })));
      badge.position.set(pl.x - w / 2 + 0.6, pl.y + h / 2 - 0.42, -0.2);
      plane.add(badge);
    }
  }

  interface N { group: Group; rim: LineBasicMaterial; body: MeshBasicMaterial | MeshStandardMaterial; x: number; y: number; pulse: number; phase: number }
  const nodes = new Map<string, N>();
  layout.tiles.forEach((t, i) => {
    const group = new Group();
    group.position.set(t.x, t.y, 0);
    group.scale.setScalar(t.size / TILE);
    const body = o.dark
      ? track(new MeshStandardMaterial({ color: 0x1c2147, roughness: 0.35, metalness: 0.25, transparent: true, opacity: 0.94, emissive: accent, emissiveIntensity: 0.08 }))
      : track(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.97 }));
    const rim = track(new LineBasicMaterial({ color: rimColor.clone(), transparent: true, opacity: o.dark ? 0.7 : 1 }));
    const shadow = new Sprite(track(new SpriteMaterial({ map: shadowTex, color: 0x0b1020, transparent: true, opacity: o.dark ? 0.45 : 0.2, depthWrite: false })));
    shadow.scale.setScalar(TILE * 1.9);
    shadow.position.set(0, -0.14, -depth / 2 - 0.02);
    group.add(shadow);
    group.add(new Mesh(cubeGeo, body));
    const border = new Line(borderGeo, rim);
    border.position.z = depth / 2 + 0.004;
    group.add(border);
    const tex = texByIcon.get(t.icon);
    if (tex) {
      const logo = new Mesh(logoGeo, track(new MeshBasicMaterial({ map: tex, transparent: true, fog: false })));
      logo.position.z = depth / 2 + 0.01;
      group.add(logo);
    }
    if (o.dark) {
      const glow = new Sprite(track(new SpriteMaterial({ map: glowTex, color: accent, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false })));
      glow.scale.setScalar(TILE * 1.55);
      glow.position.z = -0.1;
      group.add(glow);
    }
    plane.add(group);
    nodes.set(t.id, { group, rim, body, x: t.x, y: t.y, pulse: 0, phase: i * 1.9 });
  });

  // connectors: thin (1.5px) ribbons along the routed, rounded paths, under the tiles; only observability flows are dashed
  const flows = layout.flows.map((f) => {
    const pts = f.path.map((q) => new Vector3(q.x, q.y, 0.03));
    const sm = sampler(pts);
    const dashed = f.kind !== 'request';
    const color = new Color(f.color);
    addLine(dashed ? dashPolyline(f.path, 0.13, 0.11) : [f.path], color, o.dark ? 0.62 : 0.78, 0.02);
    return { ...sm, to: f.to, color };
  });

  // packets: one glowing dot + a short fading trail each, evenly spaced along the flow and always moving end to end
  const SPEED = 1.15; // world units per second
  const SPACING = o.mobile ? 4.2 : 3.2;
  const dotLight = (c: Color) => c.clone().lerp(new Color(0xffffff), o.dark ? 0.45 : 0);
  interface P { flow: number; base: number; core: Sprite; halo: Sprite; trail: Sprite[]; prev: number }
  const packets: P[] = [];
  const mkSprite = (map: Texture, color: Color, size: number, additive: boolean, z: number) => {
    const sp = new Sprite(track(new SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending })));
    sp.scale.setScalar(size);
    sp.position.z = z;
    plane.add(sp);
    return sp;
  };
  flows.forEach((fl, fi) => {
    const n = packetCount(fl.total, SPACING, o.mobile ? 2 : 4);
    for (let k = 0; k < n; k++) {
      const trail = Array.from({ length: TRAIL }, (_, j) => mkSprite(dotTex, fl.color, 0.13 - j * 0.02, false, 0.034));
      packets.push({
        flow: fi, base: (k / n + fi * 0.173) % 1, prev: 0, trail,
        halo: mkSprite(glowTex, fl.color, 0.55, o.dark, 0.035),
        core: mkSprite(dotTex, dotLight(fl.color), 0.17, false, 0.036),
      });
    }
  });

  /* ---------------- labels: small HTML text under every tile, projected each frame ---------------- */
  const labelLayer = document.createElement('div');
  labelLayer.className = 'hero-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  const labels = o.host
    ? layout.tiles.map((t) => {
      const el = document.createElement('span');
      el.className = 'hero-tile-label';
      el.dataset.node = t.id;
      el.textContent = t.label;
      labelLayer.appendChild(el);
      return { el, a: labelAnchor(t), node: nodes.get(t.id)! };
    })
    : [];
  o.host?.appendChild(labelLayer);
  const v3 = new Vector3();
  const placeLabels = () => {
    if (!labels.length) return;
    hero.updateMatrixWorld(true);
    for (const l of labels) {
      v3.set(l.a.x, l.a.y + (l.node.group.position.y - l.node.y), 0.0);
      plane.localToWorld(v3);
      v3.project(camera);
      l.el.style.transform = `translate(${((v3.x + 1) / 2) * vw}px, ${((1 - v3.y) / 2) * vh}px) translate(-50%, 0)`;
    }
  };

  const tmp = new Vector3();
  const pointer = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  let last = 0;

  // fit the tilted plane into the free area; connector widths are in world units, so they are rebuilt for the new scale (1.5px on screen)
  const refit = () => {
    const fit = fitTiltedBox(fitBox, vw, vh, fov, CAM_Z, bw + 0.6, bh + 0.6, YAW, ELEV, FILL);
    hero.position.set(fit.x, fit.y, 0);
    hero.scale.setScalar(fit.scale);
    const pxToWorld = viewSize(fov, CAM_Z, vw / vh).height / vh;
    const wLocal = (LINE_PX * pxToWorld) / Math.max(1e-4, fit.scale);
    for (const l of lines) {
      l.mesh.geometry.dispose();
      l.mesh.geometry = ribbonGeometry(l.polys, wLocal);
    }
    o.canvas.dataset.sceneBounds = JSON.stringify({ left: Math.round(fit.bounds.left), top: Math.round(fit.bounds.top), right: Math.round(fit.bounds.right), bottom: Math.round(fit.bounds.bottom) });
    hero.rotation.set(ELEV, YAW, 0);
    placeLabels();
  };
  refit();

  const render = (t: number) => {
    const dt = Math.min(Math.max(t - last, 0), 0.1);
    last = t;
    smooth.x += (pointer.x - smooth.x) * 0.04;
    smooth.y += (pointer.y - smooth.y) * 0.04;
    hero.rotation.set(ELEV - smooth.y * 0.05, YAW + smooth.x * 0.07, 0); // mouse tilts the whole plane by <= 4 deg
    for (const p of packets) {
      const fl = flows[p.flow];
      const d = (((p.base + (t * SPEED) / fl.total) % 1) + 1) % 1 * fl.total;
      if (d < p.prev) { const n = nodes.get(fl.to); if (n) n.pulse = 1; }
      p.prev = d;
      const env = Math.min(1, d / 0.4, (fl.total - d) / 0.4);
      fl.at(d, tmp);
      p.core.position.set(tmp.x, tmp.y, p.core.position.z);
      p.halo.position.set(tmp.x, tmp.y, p.halo.position.z);
      (p.core.material as SpriteMaterial).opacity = env;
      (p.halo.material as SpriteMaterial).opacity = env * (o.dark ? 0.55 : 0.3);
      p.trail.forEach((sp, j) => {
        const dd = d - (j + 1) * 0.11;
        const e = dd < 0 ? 0 : Math.min(1, dd / 0.4, (fl.total - dd) / 0.4);
        fl.at(dd, tmp);
        sp.position.set(tmp.x, tmp.y, sp.position.z);
        (sp.material as SpriteMaterial).opacity = e * (0.62 - j * 0.14);
      });
    }
    nodes.forEach((n) => {
      n.pulse = Math.max(0, n.pulse - dt * 3.5); // quick, subtle arrival pulse
      n.group.position.y = n.y + Math.sin(t * 0.7 + n.phase) * 0.02; // idle float (~1px), desynced
      if (o.dark) {
        n.rim.opacity = 0.7 + n.pulse * 0.25;
        (n.body as MeshStandardMaterial).emissiveIntensity = 0.08 + n.pulse * 0.55;
      } else n.rim.color.copy(rimColor).lerp(accent, n.pulse);
    });
    renderer.render(scene, camera);
    placeLabels();
  };

  return {
    render,
    resize(w, h, box) {
      vw = w;
      vh = h;
      if (box) fitBox = box;
      else fitBox = { left: 0, top: 0, width: w, height: h };
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      refit();
    },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const l of lines) l.mesh.geometry.dispose();
      labelLayer.remove();
      renderer.dispose();
      renderer.forceContextLoss();
    },
    stats: { nodes: nodes.size, edges: flows.length, packets: packets.length, renderers: 1 },
  };
}
