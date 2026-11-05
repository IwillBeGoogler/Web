import { DATABASE_PROFILES } from './databases';
import { ANALYTICS_PROFILES } from './analytics';
import { MESSAGING_PROFILES } from './messaging';
import { PLATFORM_PROFILES } from './platform';
import { GENERIC_PROFILES } from './generic';

export const SPEC_PROFILES = [...DATABASE_PROFILES, ...ANALYTICS_PROFILES, ...MESSAGING_PROFILES, ...PLATFORM_PROFILES, ...GENERIC_PROFILES];
