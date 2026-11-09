import { settingsSync } from "@/shared/settingsSync";
import { createHttpClient } from "@/shared/http/client";
import { createTokenStore } from "@/shared/http/tokenStore";

/** App-wide token store and HTTP client. */
export const tokens = createTokenStore();
export const http = createHttpClient({ tokens, locale: () => (typeof navigator === "undefined" ? "en" : navigator.language) });

// Signed-in readers' settings (reading prefs, language) follow them across devices.
settingsSync.start({ http: http as never, tokens });
