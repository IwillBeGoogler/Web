import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { devProxy } from "./devProxy.ts";

// the nginx template variable, spelled so that no lint rule mistakes it for a template literal
const MQTT_URL = "$" + "{MQTT_URL}";
const nginx = readFileSync(join(process.cwd(), "nginx.conf"), "utf8");

describe("dev proxy", () => {
  it("routes /mqtt to EMQX as a WebSocket (VITE_MQTT_PROXY, default http://localhost:8083)", () => {
    const m = devProxy["/mqtt"];
    expect(m.ws).toBe(true);
    expect(m.target).toBe(process.env.VITE_MQTT_PROXY ?? "http://localhost:8083");
  });
  it("never lets /api/internal reach the API, and keeps it ahead of /api", () => {
    const keys = Object.keys(devProxy);
    expect(keys.indexOf("/api/internal")).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf("/api/internal")).toBeLessThan(keys.indexOf("/api"));
    expect(devProxy["/api/internal"].bypass()).toBe(false); // vite answers 404
  });
});

describe("nginx.conf", () => {
  it("blocks /api/internal/ with a 404 before it can reach the API (also past the /stream regex)", () => {
    const block = /location \^~ \/api\/internal\/ \{\s*return 404;\s*\}/.exec(nginx);
    expect(block).not.toBeNull();
    expect(nginx.indexOf(block?.[0] ?? "")).toBeLessThan(nginx.indexOf("location /api/ {"));
  });
  it("proxies /mqtt as a WebSocket to MQTT_URL with long timeouts and no buffering", () => {
    const m = /location = \/mqtt \{([\s\S]*?)\n {4}\}/.exec(nginx);
    expect(m).not.toBeNull();
    const b = m?.[1] ?? "";
    expect(b).toContain("proxy_pass $mqtt_upstream;"); // variable set at server scope from MQTT_URL
    expect(nginx).toContain(`set $mqtt_upstream ${MQTT_URL};`);
    expect(b).not.toContain(`${MQTT_URL}/`); // no URI part: the path is passed through
    expect(b).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(b).toContain('proxy_set_header Connection "upgrade";');
    expect(b).toContain("proxy_read_timeout 1h;");
    expect(b).toContain("proxy_buffering off;");
  });
  it("the image defaults MQTT_URL so the template always renders", () => {
    expect(readFileSync(join(process.cwd(), "Dockerfile"), "utf8")).toMatch(/ENV MQTT_URL=http:\/\/emqx:8083/);
  });
});
