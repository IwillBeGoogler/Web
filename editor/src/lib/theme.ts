export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const resolveTheme = (pref: ThemePref, systemDark: boolean): ResolvedTheme => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref);
export const nextTheme = (pref: ThemePref): ThemePref => (pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light');
