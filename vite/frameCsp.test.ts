import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FRAME_CSP } from "./frameCsp.ts";

describe("FRAME_CSP", () => {
  it("sandboxes scripts into an opaque origin and denies everything else by default", () => {
    const parts = FRAME_CSP.split("; ");
    expect(parts[0]).toBe("sandbox allow-scripts");
    expect(parts).toContain("default-src 'none'");
    expect(parts).toContain("frame-ancestors 'self'");
    expect(parts).toContain("form-action 'none'");
    expect(parts).toContain("base-uri 'none'");
    expect(FRAME_CSP).not.toContain("allow-same-origin");
  });

  it("equals the header nginx.conf serves", () => {
    const conf = readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");
    expect(conf).toContain(`Content-Security-Policy "${FRAME_CSP}"`);
  });
});
