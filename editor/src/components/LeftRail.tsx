import { Sidebar } from './Sidebar';

/**
 * Left rail: the component palette only. File navigation lives in the top bar (the Files popover next to the project name,
 * the ⌘P quick switcher and the file tabs).
 */
export function LeftRail() {
  return <Sidebar />;
}
