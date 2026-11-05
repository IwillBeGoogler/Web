import { describe, expect, it } from "vitest";
import { closestT, ORBITS, orbitPoint } from "./orbit";
import { rumble } from "./shake";

describe("closestT", () => {
  it("finds where a straight line passes nearest the camera", () => {
    expect(closestT({ x: -1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(0.5);
    expect(closestT({ x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 })).toBe(0);
    expect(closestT({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe("rumble", () => {
  it("starts and ends still, alternates and fades", () => {
    const r = rumble(10, 10, () => 1);
    expect(r[0]).toBe(0);
    expect(r.at(-1)).toBe(0);
    expect(r[1]).toBeGreaterThan(0);
    expect(r[2]).toBeLessThan(0);
    expect(Math.abs(r[1] ?? 0)).toBeGreaterThan(Math.abs(r[8] ?? 0));
  });
});

describe("orbitPoint", () => {
  const up = { x: 0, y: 1, z: 0 };
  it("stays on its radius", () => {
    const o = { r: 11, period: 40, tilt: 0.7, node: 0.4, phase: 1, size: 0.05 };
    for (const t of [0, 3, 17, 39]) {
      const p = orbitPoint(o, t, up);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(11);
    }
  });
  it("with no tilt arcs straight over the horizon", () => {
    const o = { r: 10, period: 40, tilt: 0, node: 0, phase: Math.PI / 2, size: 0.05 };
    const p = orbitPoint(o, 0, up);
    expect(p.y).toBeCloseTo(10);
  });
  it("comes back after one period", () => {
    const o = ORBITS[1];
    if (!o) throw new Error("no orbit");
    const a = orbitPoint(o, 0, up);
    const b = orbitPoint(o, Math.abs(o.period), up);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.z).toBeCloseTo(a.z);
  });
});
