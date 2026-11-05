import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
} from "three";

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas unavailable");
  return { c, g };
};

/** Seeded PRNG so every visitor sees the same crinkles. */
const prng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

/**
 * Multi-layer insulation: a crumpled-foil height field turned into a normal map, plus a colour map
 * with the uneven gold/amber tint of kapton over aluminium and a roughness map that follows the folds.
 */
function foilMaps() {
  const S = 512;
  const rand = prng(7);
  const { g: h } = canvas(S, S);
  h.fillStyle = "#808080";
  h.fillRect(0, 0, S, S);
  // long creases, then many small crumple facets
  for (let i = 0; i < 70; i++) {
    const v = 90 + rand() * 80;
    h.strokeStyle = `rgb(${v},${v},${v})`;
    h.lineWidth = 1 + rand() * 5;
    h.globalAlpha = 0.5;
    h.beginPath();
    let x = rand() * S;
    let y = rand() * S;
    h.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rand() - 0.5) * 140;
      y += (rand() - 0.5) * 140;
      h.lineTo(x, y);
    }
    h.stroke();
  }
  for (let i = 0; i < 350; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const s = 14 + rand() * 50;
    const v = 50 + Math.floor(rand() * 160);
    h.fillStyle = `rgb(${v},${v},${v})`;
    h.globalAlpha = 0.35;
    h.beginPath();
    h.moveTo(x, y);
    for (let k = 0; k < 3; k++) h.lineTo(x + (rand() - 0.5) * s * 2, y + (rand() - 0.5) * s * 2);
    h.closePath();
    h.fill();
  }
  const height = h.getImageData(0, 0, S, S).data;
  const at = (x: number, y: number) => (height[(((y + S) % S) * S + ((x + S) % S)) * 4] ?? 128) / 255;

  const { c: nc, g: n } = canvas(S, S);
  const { c: cc, g: col } = canvas(S, S);
  const { c: rc, g: rough } = canvas(S, S);
  const nImg = n.createImageData(S, S);
  const cImg = col.createImageData(S, S);
  const rImg = rough.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nImg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 2] = (1 / len) * 255;
      nImg.data[i + 3] = 255;
      const hv = at(x, y);
      const tint = 0.75 + hv * 0.35;
      cImg.data[i] = Math.min(255, 196 * tint);
      cImg.data[i + 1] = Math.min(255, 128 * tint);
      cImg.data[i + 2] = Math.min(255, 38 * tint);
      cImg.data[i + 3] = 255;
      const r = 40 + Math.abs(dx + dy) * 120;
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.min(255, r);
      rImg.data[i + 3] = 255;
    }
  }
  n.putImageData(nImg, 0, 0);
  col.putImageData(cImg, 0, 0);
  rough.putImageData(rImg, 0, 0);
  const tex = (c: HTMLCanvasElement, srgb = false) => {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  return { map: tex(cc, true), normalMap: tex(nc), roughnessMap: tex(rc) };
}

/** Optical solar reflector radiator: a grid of mirror tiles with dull seams. */
function radiatorMaps() {
  const S = 256;
  const { c, g } = canvas(S, S);
  const { c: rc, g: r } = canvas(S, S);
  g.fillStyle = "#4a4f57";
  g.fillRect(0, 0, S, S);
  r.fillStyle = "#ffffff";
  r.fillRect(0, 0, S, S);
  const n = 8;
  const t = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 150 + ((i * 7 + j * 3) % 5) * 8;
      g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
      g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
      r.fillStyle = "#1a1a1a";
      r.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    }
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  return { map, roughnessMap: new CanvasTexture(rc) };
}

/**
 * Whole solar wing, front side: glass-covered cells in strings, silver interconnects, the
 * brand printed across the middle panels. Each panel samples its own slice of this one texture.
 */
function cellTexture(panels: number, brand: string | null) {
  const W = 512 * panels;
  const H = 640;
  const { c, g } = canvas(W, H);
  const rand = prng(brand ? 11 : 23);
  g.fillStyle = "#b8bec8";
  g.fillRect(0, 0, W, H);
  const pw = W / panels;
  for (let p = 0; p < panels; p++) {
    const x0 = p * pw + 14;
    const y0 = 14;
    const w = pw - 28;
    const h = H - 28;
    g.fillStyle = "#0a1230";
    g.fillRect(x0, y0, w, h);
    const cols = 6;
    const rows = 8;
    const cw = w / cols;
    const ch = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = x0 + i * cw + 2;
        const y = y0 + j * ch + 2;
        const s = rand() * 10;
        const grad = g.createLinearGradient(x, y, x + cw, y + ch);
        grad.addColorStop(0, `rgb(${24 + s},${36 + s},${84 + s * 1.5})`);
        grad.addColorStop(0.6, `rgb(${14 + s},${22 + s},${58 + s})`);
        grad.addColorStop(1, `rgb(${20 + s},${30 + s},${74 + s})`);
        g.fillStyle = grad;
        // clipped corners, like real space-grade cells
        const k = 6;
        g.beginPath();
        g.moveTo(x + k, y);
        g.lineTo(x + cw - 4 - k, y);
        g.lineTo(x + cw - 4, y + k);
        g.lineTo(x + cw - 4, y + ch - 4 - k);
        g.lineTo(x + cw - 4 - k, y + ch - 4);
        g.lineTo(x + k, y + ch - 4);
        g.lineTo(x, y + ch - 4 - k);
        g.lineTo(x, y + k);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(170,185,215,0.22)";
        g.lineWidth = 1;
        for (let f = 1; f < 8; f++) {
          g.beginPath();
          g.moveTo(x + 2, y + ((ch - 4) * f) / 8);
          g.lineTo(x + cw - 6, y + ((ch - 4) * f) / 8);
          g.stroke();
        }
        g.fillStyle = "rgba(200,205,215,0.55)";
        g.fillRect(x + cw / 2 - 3, y, 2, ch - 4);
      }
    }
  }
  if (brand) {
    const s = 230;
    g.font = `800 ${s * 0.92}px system-ui, -apple-system, sans-serif`;
    const word = g.measureText(brand.slice(1)).width;
    const total = s + 40 + word;
    const x0 = (W - total) / 2;
    const y0 = (H - s) / 2;
    g.globalAlpha = 0.9;
    g.fillStyle = "#f2f2ee";
    g.beginPath();
    g.roundRect(x0, y0, s, s, 26);
    g.fill();
    g.fillStyle = "#0b0b0c";
    g.font = `600 ${s * 0.78}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(brand[0] ?? "i", x0 + s / 2, y0 + s / 2 + 8);
    g.fillStyle = "#f2f2ee";
    g.font = `800 ${s * 0.92}px system-ui, -apple-system, sans-serif`;
    g.textAlign = "left";
    g.fillText(brand.slice(1), x0 + s + 40, y0 + s / 2 + 10);
    g.globalAlpha = 1;
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Wing back: white kapton with harness lines. */
function backTexture() {
  const { c, g } = canvas(512, 640);
  g.fillStyle = "#d9d6cc";
  g.fillRect(0, 0, 512, 640);
  g.strokeStyle = "rgba(120,110,90,0.35)";
  g.lineWidth = 3;
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, (640 * i) / 6);
    g.lineTo(512, (640 * i) / 6);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Point the +z/−z faces of a box at slice `i` of `n` along u, so a row of panels shares one texture. */
function sliceUv(geo: BufferGeometry, i: number, n: number) {
  const uv = geo.getAttribute("uv");
  for (let v = 16; v < 24; v++) uv.setX(v, (i + uv.getX(v)) / n);
  uv.needsUpdate = true;
}

/**
 * Communications satellite built from primitives, scaled to ~5 units across: a gold-MLI bus with
 * mirror-tile radiators, two four-panel solar wings on yokes (cells on the −z side, which faces the
 * camera on a flyby; the brand prints across the right wing), a parabolic Earth-facing reflector with
 * its feed on struts, star trackers and thruster clusters. Point +z at the planet with `lookAt`.
 */
export function createSatellite(brand: string, envMap: Texture | null) {
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texs: Texture[] = [];
  const keepM = <T extends Material>(m: T) => {
    mats.push(m);
    return m;
  };
  const keepT = <T extends Texture>(t: T) => {
    texs.push(t);
    return t;
  };

  const foil = foilMaps();
  for (const t of Object.values(foil)) keepT(t);
  const gold = keepM(new MeshStandardMaterial({ ...foil, metalness: 1, roughness: 0.3, normalScale: new Vector2(0.45, 0.45), envMap, envMapIntensity: 0.6 }));
  const silverFoil = keepM(
    new MeshStandardMaterial({
      color: 0xc9ccd2,
      normalMap: foil.normalMap,
      roughnessMap: foil.roughnessMap,
      metalness: 1,
      roughness: 0.5,
      normalScale: new Vector2(0.4, 0.4),
      envMap,
      envMapIntensity: 0.5,
    }),
  );
  const rad = radiatorMaps();
  keepT(rad.map);
  keepT(rad.roughnessMap);
  const radiator = keepM(new MeshStandardMaterial({ ...rad, metalness: 0.9, roughness: 1, envMap, envMapIntensity: 0.5 }));
  const steel = keepM(new MeshStandardMaterial({ color: 0xaab1ba, metalness: 0.9, roughness: 0.35, envMap, envMapIntensity: 0.5 }));
  const carbon = keepM(new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.3, roughness: 0.45, envMap, envMapIntensity: 0.5 }));
  const black = keepM(new MeshStandardMaterial({ color: 0x08090b, metalness: 0.2, roughness: 0.25, envMap, envMapIntensity: 0.6 }));
  const white = keepM(new MeshStandardMaterial({ color: 0xeeeeea, metalness: 0, roughness: 0.65, side: DoubleSide, envMap, envMapIntensity: 0.5 }));
  const back = keepM(new MeshStandardMaterial({ map: keepT(backTexture()), metalness: 0, roughness: 0.8 }));
  const cells = (tex: Texture) =>
    keepM(
      new MeshPhysicalMaterial({
        map: tex,
        metalness: 0.2,
        roughness: 0.35,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        envMap,
        envMapIntensity: 0.35,
      }),
    );

  const sat = new Group();
  const add = (geo: BufferGeometry, mat: Material | Material[], x = 0, y = 0, z = 0, parent: Group = sat) => {
    geos.push(geo);
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const rod = (a: Vector3, b: Vector3, r: number, mat: Material, parent: Group = sat) => {
    const d = new Vector3().subVectors(b, a);
    const m = add(new CylinderGeometry(r, r, d.length(), 8), mat, 0, 0, 0, parent);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
    return m;
  };

  // bus (box face order +x −x +y −y +z −z): radiators east/west, gold MLI elsewhere, silver on the Earth deck
  add(new BoxGeometry(0.9, 1.1, 0.9), [radiator, radiator, gold, gold, silverFoil, gold]);
  // deck edge frames
  for (const y of [-0.555, 0.555]) add(new BoxGeometry(0.94, 0.03, 0.94), steel, 0, y, 0);
  // launch adapter ring + apogee engine under the bus
  add(new CylinderGeometry(0.3, 0.34, 0.1, 32), steel, 0, -0.62, 0);
  const engine = add(new CylinderGeometry(0.07, 0.17, 0.3, 24, 1, true), carbon, 0, -0.82, 0);
  engine.material = keepM(new MeshStandardMaterial({ color: 0x5b4a3a, metalness: 0.8, roughness: 0.5, side: DoubleSide }));
  // attitude thrusters on each lower corner
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = add(new CylinderGeometry(0.018, 0.035, 0.07, 10, 1, true), carbon, sx * 0.47, -0.5, sz * 0.47);
      t.rotation.z = sx * 0.6;
    }
  }
  // star trackers: black baffled tubes on the anti-Earth top corner
  for (const sx of [-1, 1]) {
    const st = add(new CylinderGeometry(0.06, 0.05, 0.16, 16), black, sx * 0.25, 0.62, -0.32);
    st.rotation.x = -0.5;
    add(new CylinderGeometry(0.075, 0.075, 0.02, 16), steel, sx * 0.25, 0.68, -0.36).rotation.x = -0.5;
  }
  // omni antenna mast
  rod(new Vector3(-0.3, 0.555, 0.3), new Vector3(-0.3, 0.95, 0.3), 0.012, steel);
  add(new CylinderGeometry(0.03, 0.03, 0.08, 10), white, -0.3, 0.98, 0.3);

  // solar wings: yoke, then four hinged panels with small gaps
  const PANELS = 4;
  const PW = 0.62;
  const PH = 0.8;
  const GAP = 0.03;
  const frontPlain = cells(keepT(cellTexture(PANELS, null)));
  const frontBrand = cells(keepT(cellTexture(PANELS, brand)));
  const frame = keepM(new MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.4, envMap, envMapIntensity: 0.4 }));
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.position.set(side * 0.45, 0, 0);
    // a slight sun-tracking tilt reads as a real, articulated array
    wing.rotation.x = side * 0.12;
    sat.add(wing);
    add(new CylinderGeometry(0.05, 0.05, 0.08, 16), steel, side * 0.04, 0, 0, wing).rotation.z = Math.PI / 2;
    const root = side * 0.5;
    rod(new Vector3(side * 0.06, 0, 0), new Vector3(root, PH * 0.42, 0), 0.014, carbon, wing);
    rod(new Vector3(side * 0.06, 0, 0), new Vector3(root, -PH * 0.42, 0), 0.014, carbon, wing);
    const front = side > 0 ? frontBrand : frontPlain;
    for (let i = 0; i < PANELS; i++) {
      // the −z face runs u toward local −x, so the right wing samples its slices in reverse to read left to right
      const slice = side > 0 ? PANELS - 1 - i : i;
      const geo = new BoxGeometry(PW, PH, 0.025);
      sliceUv(geo, slice, PANELS);
      const x = root + side * (PW / 2 + i * (PW + GAP));
      add(geo, [frame, frame, frame, frame, back, front], x, 0, 0, wing);
      if (i < PANELS - 1) {
        for (const hy of [-PH * 0.35, PH * 0.35]) add(new BoxGeometry(GAP + 0.02, 0.05, 0.03), steel, x + side * (PW / 2 + GAP / 2), hy, 0, wing);
      }
    }
  }

  // Earth-facing parabolic reflector (+z) with its feed horn held at the focus by three struts
  const F = 0.32;
  const R = 0.55;
  const prof: Vector2[] = [];
  for (let k = 0; k <= 16; k++) {
    const r = (R * k) / 16;
    prof.push(new Vector2(r, (r * r) / (4 * F)));
  }
  const dishGroup = new Group();
  dishGroup.position.set(0, 0.1, 0.5);
  dishGroup.rotation.x = Math.PI / 2; // lathe opens toward +y; turn it to face +z
  sat.add(dishGroup);
  add(new LatheGeometry(prof, 48), white, 0, 0, 0, dishGroup);
  add(new CylinderGeometry(R + 0.01, R + 0.01, 0.02, 48, 1, true), steel, 0, (R * R) / (4 * F), 0, dishGroup);
  add(new CylinderGeometry(0.035, 0.05, 0.1, 16), steel, 0, F, 0, dishGroup);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    rod(new Vector3(Math.cos(a) * R * 0.92, (R * R * 0.85) / (4 * F), Math.sin(a) * R * 0.92), new Vector3(0, F, 0), 0.008, steel, dishGroup);
  }
  // small secondary dish on the +x/+y corner
  const small = new Group();
  small.position.set(0.32, 0.555, 0.3);
  sat.add(small);
  const sp: Vector2[] = [];
  for (let k = 0; k <= 10; k++) {
    const r = (0.18 * k) / 10;
    sp.push(new Vector2(r, (r * r) / 0.5));
  }
  rod(new Vector3(0, 0, 0), new Vector3(0, 0.12, 0), 0.012, steel, small);
  add(new LatheGeometry(sp, 32), white, 0, 0.12, 0, small).rotation.x = 0.7;

  return {
    object: sat,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
