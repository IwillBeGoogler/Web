export const fmt = (d) => new Date(d).toLocaleString();
export const toTags = (s) => s.split(",").map((t) => t.trim()).filter(Boolean);
