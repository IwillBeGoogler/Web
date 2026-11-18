import DOMPurify from "dompurify";

// task-list boxes are the only input a story may have: read-only checkboxes
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "INPUT") return;
  if (node.getAttribute("type") !== "checkbox") node.remove();
  else node.setAttribute("disabled", "");
});

/** Server-rendered Markdown HTML, cleaned before it touches the DOM. */
export const safeHtml = (html: string) =>
  DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form"],
    FORBID_ATTR: ["style"],
  });
