/** Images pasted or dropped into the story body. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type ImageProblem = "type" | "size" | "failed";
export type ImageResult = { file: File; problem?: ImageProblem; error?: unknown };

export function imageProblem(f: Pick<File, "type" | "size">): "type" | "size" | null {
  if (!IMAGE_TYPES.includes(f.type)) return "type";
  return f.size > MAX_IMAGE_BYTES ? "size" : null;
}

/** The image files among `files` (clipboard and drop lists include other things). */
export const imageFiles = (files: ArrayLike<File> | null | undefined): File[] => Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));

let counter = 0;
export const newUploadId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export const placeholder = (id: string) => `![Uploading…](#upload-${id})`;

const altOf = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[[\]()<>\\`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

export const imageMarkdown = (url: string, name: string) => `![${altOf(name)}](${url})`;

/** Swaps the placeholder for `md`, or removes its line (and a blank line after it) when `md` is null. */
export function settlePlaceholder(body: string, id: string, md: string | null): string {
  const ph = placeholder(id);
  if (!body.includes(ph)) return body;
  if (md !== null) return body.replace(ph, () => md);
  return body
    .replace(`\n\n${ph}`, "")
    .replace(`${ph}\n\n`, "")
    .replace(ph, "")
    .replace(/\n{3,}/g, "\n\n");
}

export type UploadIO = {
  /** Called for each valid file before its upload starts: put the placeholder in the text. */
  place: (id: string, placeholderMd: string, file: File) => void;
  /** Called when its upload ends: `md` replaces the placeholder, or null removes it. */
  settle: (id: string, md: string | null, file: File) => void;
};

/** Validates and uploads images; every valid file gets a placeholder that is settled. Files that are not valid images are reported and skipped. */
export async function uploadImages(files: File[], upload: (f: File) => Promise<string>, io: UploadIO): Promise<ImageResult[]> {
  return Promise.all(
    files.map(async (file): Promise<ImageResult> => {
      const problem = imageProblem(file);
      if (problem) return { file, problem };
      const id = newUploadId();
      io.place(id, placeholder(id), file);
      try {
        const url = await upload(file);
        io.settle(id, imageMarkdown(url, file.name), file);
        return { file };
      } catch (error) {
        io.settle(id, null, file);
        return { file, problem: "failed", error };
      }
    }),
  );
}

/** Where a caret at `pos` ends up when the text at `at` (length `oldLen`) is replaced by text of length `newLen`. */
export function shiftCaret(pos: number, at: number, oldLen: number, newLen: number): number {
  if (pos <= at) return pos;
  if (pos >= at + oldLen) return pos + newLen - oldLen;
  return at + newLen;
}
