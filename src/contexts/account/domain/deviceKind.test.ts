import { describe, expect, it } from "vitest";
import { deviceKind } from "./account";

describe("deviceKind", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1", "mobile"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0 Mobile Safari/537.36", "mobile"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1", "tablet"],
    ["Mozilla/5.0 (Linux; Android 15; SM-X910) Chrome/140.0 Safari/537.36", "tablet"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Chrome/140.0 Safari/537.36", "desktop"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/140.0", "desktop"],
    ["Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0", "desktop"],
    ["curl/8.7.1", "cli"],
    ["Go-http-client/2.0", "cli"],
    ["", "unknown"],
    ["SomethingOdd/1.0", "unknown"],
  ])("%s -> %s", (ua, kind) => expect(deviceKind(ua)).toBe(kind));
});
