import { Platform } from 'react-native';

import { THEME } from '@/lib/theme';

export const Colors = {
  light: {
    text: THEME.light.foreground,
    background: THEME.light.background,
    backgroundElement: THEME.light.card,
    backgroundSelected: THEME.light.secondary,
    textSecondary: THEME.light.mutedForeground,
  },
  dark: {
    text: THEME.dark.foreground,
    background: THEME.dark.background,
    backgroundElement: THEME.dark.card,
    backgroundSelected: THEME.dark.secondary,
    textSecondary: THEME.dark.mutedForeground,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
