/** The shortcuts shown in the `?` cheatsheet: [keys separated by spaces, what it does] */
export const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Tools', items: [['V', 'Select'], ['H', 'Hand'], ['R O D', 'Rectangle, ellipse, diamond'], ['T', 'Text'], ['S', 'Sticky note (also N)'], ['F', 'Frame'], ['W', 'Mind map'], ['P', 'Pen'], ['L', 'Highlighter'], ['E', 'Eraser'], ['A', 'Arrow / connector'], ['C', 'Comment']] },
  { title: 'Stickies', items: [['Tab', 'Next sticky to the right'], ['⇧ Enter', 'Next sticky below'], ['Double-click', 'Edit the text'], ['Esc', 'Stop editing']] },
  { title: 'Mind map', items: [['Tab', 'Add a child'], ['Enter', 'Add a sibling'], ['Double-click', 'Edit the text'], ['⌘K', 'Import or export an outline']] },
  { title: 'Present', items: [['← →', 'Previous / next frame'], ['Home End', 'First / last frame'], ['P', 'Laser pointer'], ['S', 'Spotlight'], ['Esc', 'Exit']] },
  { title: 'Design', items: [['⇧ D', 'Dev mode (inspect)'], ['⇧ R', 'Rulers'], ['Alt-hover', 'Measure distances'], ['⌘ click', 'Follow a link'], ['⇧ arrows', 'Nudge 10 px']] },
  { title: 'Everywhere', items: [['⌘K', 'Commands'], ['⌘P', 'Go to file'], ['⇧ 1', 'Zoom to fit'], ['⌘Z ⇧⌘Z', 'Undo / redo'], ['⌘G', 'Group'], ['?', 'This list']] },
];
