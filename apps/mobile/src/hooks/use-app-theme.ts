import * as React from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { THEME } from '@/lib/theme';

export type ThemePalette = (typeof THEME)['light'] | (typeof THEME)['dark'];

export function useAppTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = THEME[isDark ? 'dark' : 'light'];

  return { colorScheme, isDark, palette };
}

export function useThemedStyles<T>(
  createStyles: (palette: ThemePalette, isDark: boolean) => T
) {
  const theme = useAppTheme();
  const styles = React.useMemo(
    () => createStyles(theme.palette, theme.isDark),
    [createStyles, theme.isDark, theme.palette]
  );

  return { ...theme, styles };
}