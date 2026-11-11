import { loadEnv } from "vite";

// Dev/preview proxy. Order matters: `/api/internal` (the broker's auth/ACL questions, never public) must not reach the API.
// `/mqtt` is the same-origin MQTT-over-WebSocket path of the diagram editor; EMQX listens on 8083 (Backend/docs/MQTT.md).
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "VITE_");

export const devProxy = {
  "/mqtt": { target: process.env.VITE_MQTT_PROXY ?? env.VITE_MQTT_PROXY ?? "http://127.0.0.1:8083", ws: true },
  // `bypass` returning false makes Vite answer 404 without proxying
  "/api/internal": { target: "http://localhost:1", bypass: () => false as const },
  "/api": process.env.VITE_API_PROXY ?? env.VITE_API_PROXY ?? "http://127.0.0.1:8080",
};
