import { describe, expect, it } from "vitest";
import { describeDevice } from "./account";

describe("describeDevice", () => {
  it.each([
    ["", "Unknown device"],
    ["Mozilla Edg/120 Windows NT", "Edge on Windows"],
    ["Mozilla OPR/90 X11; Linux", "Opera on Linux"],
    ["Firefox/120 Android", "Firefox on Android"],
    ["Chrome/120 iPhone", "Chrome on iOS"],
    ["Safari/605 Macintosh", "Safari on macOS"],
    ["curl/8.0", "curl"],
    ["Windows only", "Windows"],
    ["Some odd agent string that is quite long indeed yes", "Some odd agent string that is quite long"],
  ])("%s", (ua, out) => expect(describeDevice(ua)).toBe(out));
});
