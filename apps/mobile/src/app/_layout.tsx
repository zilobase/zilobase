import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { NAV_THEME } from '@/lib/theme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? NAV_THEME.dark : NAV_THEME.light}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AnimatedSplashOverlay />
      <AppTabs />
      <PortalHost />
    </ThemeProvider>
  );
}
