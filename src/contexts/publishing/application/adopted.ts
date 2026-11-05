/**
 * The story id the editor just created for a story that was opened as "new". The editor route keeps the same
 * mounted editor when the address changes from /new-story to /p/{id}/edit, so typing, focus and caret survive.
 */
export const adopted: { id: number | null } = { id: null };
