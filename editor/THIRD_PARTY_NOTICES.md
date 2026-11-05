# Third-party notices

## perfect-freehand

The Board pen and highlighter turn pointer points into smooth, pressure-aware stroke outlines with
[perfect-freehand](https://github.com/steveruizok/perfect-freehand) 1.2.3 (npm `perfect-freehand`, published by its author Steve Ruiz /
`steveruizok`; the package is pinned to this exact version in `package.json`). It is a runtime dependency used in
`src/lib/board/freehand.ts`.

```
MIT License

Copyright (c) 2021 Stephen Ruiz Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Phase 6 dependencies (exact versions pinned)

Publisher and repository were checked on npm before pinning; all are MIT or ISC licensed.

| package | version | publisher / repository |
|---|---|---|
| `@modelcontextprotocol/sdk` (server) | 1.32.1 | Anthropic, PBC; `github.com/modelcontextprotocol/typescript-sdk` (the official MCP SDK) |
| `@codemirror/state`, `view`, `commands`, `autocomplete`, `language`, `lint` and `@lezer/highlight` | 6.7.6, 6.43.14, 6.11.1, 6.20.3, 6.13.1, 6.9.7, 1.2.5 | Marijn Haverbeke (`marijn`), the CodeMirror author; `code.haverbeke.berlin/codemirror/*` (the project's own forge) |
| `yaml` (root and server) | 2.9.1 | Eemeli Aro (`eemeli`); `github.com/eemeli/yaml` |
| `mysql2` (server) | 3.24.5 | Andrey Sidorov (`sidorares`); `github.com/sidorares/node-mysql2` |

`@modelcontextprotocol/sdk`, CodeMirror and `yaml` are bundled or run as runtime dependencies; the CodeMirror chunk loads only when the text view is opened. The Terraform (HCL) reader, the layout algorithms, the lint rules and the price table are written for this project (no third-party code).

## Cross-cutting dependencies (testing, accessibility, self-hosting; exact versions pinned)

Publisher and repository were checked on npm before pinning. The test tools are development dependencies only (never bundled into the
app); the server libraries run in the backend.

| package | version | licence | publisher / repository |
|---|---|---|---|
| `@playwright/test` (dev) | 1.64.1 | Apache-2.0 | Microsoft (`microsoft-oss-releases`, Pavel Feldman, Dmitry Gozman, Yury Semikhatsky); `github.com/microsoft/playwright` |
| `@axe-core/playwright` (dev) | 4.14.0 | MPL-2.0 | Deque Systems (`dqlabs`, `npmdeque`); `github.com/dequelabs/axe-core-npm`. It loads `axe-core` (MPL-2.0, `github.com/dequelabs/axe-core`) into the page under test; MPL-2.0 is file-level copyleft and nothing of it is copied into or shipped with this project |
| `openid-client` (server) | 6.8.8 | MIT | Filip Skokan (`panva`); `github.com/panva/openid-client`. Pulls in `jose` and `oauth4webapi` (same author, MIT) |
| `@node-saml/node-saml` (server) | 5.2.0 | MIT | the node-saml organisation (maintainers `markstos`, `cjbarth`); `github.com/node-saml/node-saml`. Pulls in `xml-crypto`, `xml-encryption`, `@xmldom/xmldom`, `xpath`, `xml2js`, `xmlbuilder` |
| `xml-crypto` (server, dev) | 6.4.0 | MIT | the node-saml organisation (`bjrmatos`, `yaron`, `cjbarth`); `github.com/node-saml/xml-crypto`. Used by the tests to sign the fake identity provider's SAML responses (it is also a dependency of `node-saml`) |
| `@aws-sdk/client-s3` (server) | 3.700.0 | Apache-2.0 | Amazon Web Services; `github.com/aws/aws-sdk-js-v3`. Used by the S3-compatible storage driver |

The test fixture `server/tests/fixtures/saml/idp-key.pem` / `idp-cert.pem` is a throw-away key pair generated for the SAML tests; it
protects nothing.

## IBM Cloud icon pack

`src/data/icons/cloud/ibm-*.pack.ts` embeds IBM Cloud / Watson / Db2 product glyphs from the IBM Carbon Design System icon set
(`github.com/carbon-design-system/carbon`, `packages/icons`, distributed as `@iconify-json/carbon` 1.2.29), licensed under the
Apache License 2.0 (`https://www.apache.org/licenses/LICENSE-2.0`). Copyright IBM Corp. Colours were set to IBM blue (#0f62fe); no other
modification. IBM and IBM Cloud are trademarks of IBM; the icons are used only to label IBM services.

## Caveat font (sketch look)

The "Sketch (hand-drawn) look" canvas setting and the "System design board" template use the handwriting font
[Caveat](https://github.com/googlefonts/caveat), Copyright 2014 The Caveat Project Authors, licensed under the SIL Open Font License,
Version 1.1 (`https://openfontlicense.org`). It is self-hosted (no Google Fonts request) from the npm package
[`@fontsource/caveat`](https://fontsource.org/fonts/caveat) 5.3.0 (publisher Fontsource, font by Google Inc.; declared in the shell's
`package.json`, licence `OFL-1.1`), imported lazily in `src/lib/sketch.ts` only when the sketch look is on, and embedded as a subset in
PNG / SVG exports of a sketch diagram. The font files are used unmodified; the full licence text ships in
`node_modules/@fontsource/caveat/LICENSE`. The OFL allows bundling and embedding the font with software, as long as the font itself is not sold on its own.
