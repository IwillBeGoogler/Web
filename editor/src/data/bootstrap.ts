// Registers extra palette sections (cluster wizard profiles, icon packs). Imported once by the app entry.
import { registerSections } from './catalog';
import { clusterSection } from '../clusters/palette';
import { registerCloudPacks } from './cloud';
import { registerErdSection } from './erd';
import { registerUmlSection } from './uml';
import { registerBoardSection } from './board';

let done = false;
export function bootstrapCatalog(): void {
  if (done) return;
  done = true;
  registerCloudPacks();
  registerSections([clusterSection()]);
  registerErdSection();
  registerUmlSection();
  registerBoardSection();
}
bootstrapCatalog();
