import { DarkTheme, DefaultTheme } from 'expo-router';

export const THEME = {
  light: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(240 10% 3.9%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(240 10% 3.9%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(240 10% 3.9%)',
    primary: 'hsl(240 5.9% 10%)',
    primaryForeground: 'hsl(0 0% 98%)',
    secondary: 'hsl(240 4.8% 95.9%)',
    secondaryForeground: 'hsl(240 5.9% 10%)',
    muted: 'hsl(240 4.8% 95.9%)',
    mutedForeground: 'hsl(240 3.8% 46.1%)',
    accent: 'hsl(240 4.8% 95.9%)',
    accentForeground: 'hsl(240 5.9% 10%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(240 5.9% 90%)',
    input: 'hsl(240 5.9% 90%)',
    ring: 'hsl(240 5% 64.9%)',
    chart1: 'hsl(12 76% 61%)',
    chart2: 'hsl(173 58% 39%)',
    chart3: 'hsl(197 37% 24%)',
    chart4: 'hsl(43 74% 66%)',
    chart5: 'hsl(27 87% 67%)',
    radius: '0.625rem',
  },
  dark: {
    background: 'hsl(240 10% 3.9%)',
    foreground: 'hsl(0 0% 98%)',
    card: 'hsl(240 10% 3.9%)',
    cardForeground: 'hsl(0 0% 98%)',
    popover: 'hsl(240 10% 3.9%)',
    popoverForeground: 'hsl(0 0% 98%)',
    primary: 'hsl(0 0% 98%)',
    primaryForeground: 'hsl(240 5.9% 10%)',
    secondary: 'hsl(240 3.7% 15.9%)',
    secondaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(240 3.7% 15.9%)',
    mutedForeground: 'hsl(240 5% 64.9%)',
    accent: 'hsl(240 3.7% 15.9%)',
    accentForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(0 62.8% 30.6%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(240 3.7% 15.9%)',
    input: 'hsl(240 3.7% 15.9%)',
    ring: 'hsl(240 4.9% 83.9%)',
    chart1: 'hsl(220 70% 50%)',
    chart2: 'hsl(160 60% 45%)',
    chart3: 'hsl(30 80% 55%)',
    chart4: 'hsl(280 65% 60%)',
    chart5: 'hsl(340 75% 55%)',
    radius: '0.625rem',
  },
} as const;

type NavigationTheme = typeof DefaultTheme;

function createNavigationTheme(
  baseTheme: NavigationTheme,
  colors: (typeof THEME)['light' | 'dark']
): NavigationTheme {
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.background,
      border: colors.border,
      card: colors.card,
      notification: colors.destructive,
      primary: colors.primary,
      text: colors.foreground,
    },
  };
}

export const NAV_THEME = {
  light: createNavigationTheme(DefaultTheme, THEME.light),
  dark: createNavigationTheme(DarkTheme, THEME.dark),
} as const;
