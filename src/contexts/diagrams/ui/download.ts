/** Saves a .sdd export under a safe name (the server sends the same shape). */
export const saveSdd = async (load: () => Promise<Blob>, name: string) => {
  const blob = await load();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${
    name
      .replace(/[^\w .()-]+/g, "_")
      .trim()
      .slice(0, 100) || "diagram"
  }.sdd`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
