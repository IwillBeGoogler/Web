// Header of /html-frame.html, the sandboxed host of live HTML blocks. Keep equal to Web/nginx.conf and the edge proxy on the server
// (the `sandbox` directive gives the frame an opaque origin even when opened directly).
export const FRAME_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; font-src data:; media-src data:; frame-ancestors 'self'; form-action 'none'; base-uri 'none'";
