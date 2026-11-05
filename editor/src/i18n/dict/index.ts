/* Merges the per-area dictionaries. Each area file exports `uz` and `ru`: English text -> translation. */
import * as catalog from './catalog';
import * as chrome from './chrome';
import * as messages from './messages';
import * as models from './models';
import * as panels from './panels';
import * as shellA from './shellA';
import * as shellB from './shellB';
import * as templates from './templates';
import * as uml from './uml';

type Dict = Record<string, string>;
const areas: { uz: Dict; ru: Dict }[] = [catalog, messages, chrome, shellA, shellB, panels, models, uml, templates];

export const dictionaries: Record<'uz' | 'ru', Dict> = {
  uz: Object.assign({}, ...areas.map((a) => a.uz)),
  ru: Object.assign({}, ...areas.map((a) => a.ru)),
};
