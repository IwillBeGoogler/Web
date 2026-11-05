import DOMPurify from "dompurify";

/** Server-rendered Markdown HTML, cleaned before it touches the DOM. */
export const safeHtml = (html: string) =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input"], FORBID_ATTR: ["style"] });
