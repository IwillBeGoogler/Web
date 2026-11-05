import { Monitor, Moon, Sun } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { nextTheme, type ThemePref } from '../lib/theme';
import { IconButton } from './ui/IconButton';
import { t } from '../i18n';

const ICON = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle() {
  const theme = (useSettingsStore((s) => s.global.theme) ?? 'system') as ThemePref;
  const patch = useSettingsStore((s) => s.patch);
  const Icon = ICON[theme];
  return (
    <IconButton label={t('Theme: {theme}', { theme: t(theme) })} onClick={() => patch({ theme: nextTheme(theme) })}>
      <Icon size={16} aria-hidden />
    </IconButton>
  );
}
