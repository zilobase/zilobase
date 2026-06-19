import { usePathname, useRouter } from 'expo-router';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import * as React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { type ThemePalette, useAppTheme, useThemedStyles } from '@/hooks/use-app-theme';
import type { SessionResponse } from '@notelab/features/auth';

const CONTROL_SIZE = 44;
const BUTTON_OUTER_SIZE = CONTROL_SIZE + 4;
const COLLAPSED_WIDTH = 95;
const AVATAR_SIZE = 28;
const CONTROL_GAP = 8;
const HORIZONTAL_INSET = 12;

export const TopBarInset = 84;

const TOP_BAR_SYMBOLS = {
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
} satisfies Record<string, React.ComponentProps<typeof SymbolView>['name']>;

type User = NonNullable<SessionResponse['user']>;
type AuthBackConfig = {
  visible: boolean;
  onPress: () => void;
};

export function TopBar({ authBack, user }: { authBack?: AuthBackConfig; user?: User }) {
  const pathname = usePathname();
  const { styles } = useThemedStyles(createStyles);

  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.container}>
        {authBack ? (
          <AuthTopBar authBack={authBack} />
        ) : pathname === '/' && user ? (
          <HomeTopBarControl user={user} />
        ) : (
          <ScreenTitle pathname={pathname} />
        )}
      </View>
    </SafeAreaView>
  );
}

function AuthTopBar({ authBack }: { authBack: AuthBackConfig }) {
  const { palette, styles } = useThemedStyles(createStyles);

  if (!authBack.visible) {
    return <View style={styles.authRow} />;
  }

  return (
    <View style={styles.authRow}>
      <IconCircleButton
        icon={TOP_BAR_SYMBOLS.back}
        onPress={authBack.onPress}
        tintColor={palette.foreground}
      />
    </View>
  );
}

function ScreenTitle({ pathname }: { pathname: string }) {
  const { styles } = useThemedStyles(createStyles);

  const title =
    pathname === '/create' ? 'New Note' : pathname === '/ai' ? 'AI' : pathname === '/explore' ? 'Explore' : '';

  if (!title) {
    return null;
  }

  return (
    <View style={styles.titleRow}>
      <Text style={styles.titleText}>{title}</Text>
    </View>
  );
}

function HomeTopBarControl({ user }: { user: User }) {
  const router = useRouter();
  const { isDark, palette, styles } = useThemedStyles(createStyles);
  const searchIconColor =
    isDark ? 'rgba(255,255,255,0.72)' : palette.mutedForeground;
  const searchPlaceholderColor =
    isDark ? 'rgba(255,255,255,0.56)' : palette.mutedForeground;
  const searchSelectionColor =
    isDark ? '#FFFFFF' : palette.foreground;
  const useGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const { width } = useWindowDimensions();
  const inputRef = React.useRef<TextInput>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isCloseVisible, setIsCloseVisible] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const progress = useSharedValue(0);

  const expandedWidth = Math.max(
    220,
    width - HORIZONTAL_INSET * 2 - BUTTON_OUTER_SIZE - CONTROL_GAP
  );

  React.useEffect(() => {
    progress.value = withTiming(isExpanded ? 1 : 0, {
      duration: isExpanded ? 260 : 220,
    });
  }, [isExpanded, progress]);

  React.useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsCloseVisible(true);
    }, 260);

    return () => clearTimeout(timeoutId);
  }, [isExpanded]);

  React.useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [isExpanded]);

  const shellStyle = useAnimatedStyle(() => ({
    width: COLLAPSED_WIDTH + (expandedWidth - COLLAPSED_WIDTH) * progress.value,
    marginRight: (BUTTON_OUTER_SIZE + CONTROL_GAP) * progress.value,
  }));

  const initials = React.useMemo(() => getInitials(user.name, user.email), [user.email, user.name]);
  return (
    <View pointerEvents="box-none" style={styles.homeRow}>
      <Animated.View style={[styles.searchShellWrapper, shellStyle]}>
        <GlassSurface style={styles.searchShellSurface} useGlass={useGlass}>
          {isExpanded ? (
            <View style={styles.searchExpandedRow}>
              <View style={styles.searchIconWrap}>
                <SymbolView name={TOP_BAR_SYMBOLS.search} size={20} tintColor={searchIconColor} />
              </View>
              <TextInput
                ref={inputRef}
                placeholder="Search"
                placeholderTextColor={searchPlaceholderColor}
                selectionColor={searchSelectionColor}
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
            </View>
          ) : (
            <View style={styles.searchCollapsedRow}>
              <Pressable
                hitSlop={6}
                onPress={() => {
                  setIsCloseVisible(false);
                  setIsExpanded(true);
                }}
                style={({ pressed }) => [styles.searchTapArea, pressed && styles.pressed]}>
                <View style={styles.iconCenter}>
                  <SymbolView
                    name={TOP_BAR_SYMBOLS.search}
                    size={20}
                    tintColor={searchIconColor}
                  />
                </View>
              </Pressable>

              <Pressable
                hitSlop={6}
                onPress={() => router.navigate('/')}
                style={({ pressed }) => [styles.avatarTapArea, pressed && styles.pressed]}>
                <View style={styles.avatarCenter}>
                  <View style={styles.avatarBubble}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          )}
        </GlassSurface>
      </Animated.View>

      {isCloseVisible && (
        <View style={styles.closeWrapper}>
          <IconCircleButton
            icon={TOP_BAR_SYMBOLS.close}
            onPress={() => {
              setIsCloseVisible(false);
              setIsExpanded(false);
              setQuery('');
            }}
            tintColor={palette.foreground}
          />
        </View>
      )}
    </View>
  );
}

function IconCircleButton({
  icon,
  onPress,
  tintColor,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  tintColor: string;
}) {
  const { isDark, palette } = useAppTheme();
  const useGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const surfaceStyle = [
    stylesStatic.circleButtonGlass,
    {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor:
        isDark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.88)',
    },
  ] as const;
  const buttonContent = (
    <View style={stylesStatic.circleButtonContent}>
      <SymbolView name={icon} size={20} tintColor={tintColor} />
    </View>
  );

  return (
    <Pressable onPress={onPress} style={stylesStatic.circleButton}>
      {useGlass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={isDark ? 'dark' : 'light'}
          isInteractive
          style={surfaceStyle}>
          {buttonContent}
        </GlassView>
      ) : (
        <View style={[stylesStatic.circleButtonFallback, surfaceStyle[1]]}>
          {buttonContent}
        </View>
      )}
    </Pressable>
  );
}

function GlassSurface({
  children,
  style,
  useGlass,
}: React.PropsWithChildren<{
  style: object;
  useGlass: boolean;
}>) {
  const { isDark } = useAppTheme();

  if (useGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={isDark ? 'dark' : 'light'}
        isInteractive
        style={style}>
        {children}
      </GlassView>
    );
  }

  return <View style={style}>{children}</View>;
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'N';
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return parts
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);
}

function createStyles(palette: ThemePalette, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      marginTop: -6,
    },
    container: {
      minHeight: TopBarInset,
      paddingTop: 0,
      paddingHorizontal: HORIZONTAL_INSET,
      justifyContent: 'flex-start',
    },
    homeRow: {
      position: 'relative',
      minHeight: BUTTON_OUTER_SIZE,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    authRow: {
      minHeight: BUTTON_OUTER_SIZE,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    titleRow: {
      minHeight: BUTTON_OUTER_SIZE,
      justifyContent: 'center',
    },
    titleText: {
      color: palette.foreground,
      fontFamily: Fonts.sans,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '700',
    },
    searchShellWrapper: {
      height: CONTROL_SIZE,
    },
    searchShellSurface: {
      width: '100%',
      height: CONTROL_SIZE,
      borderRadius: CONTROL_SIZE / 2,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : palette.border,
      backgroundColor: isDark ? 'rgba(28,28,30,0.88)' : 'rgba(255,255,255,0.88)',
    },
    searchCollapsedRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 6,
      paddingRight: 8,
    },
    searchExpandedRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 12,
      paddingRight: 12,
    },
    searchTapArea: {
      width: CONTROL_SIZE,
      height: CONTROL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCenter: {
      width: CONTROL_SIZE,
      height: CONTROL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarTapArea: {
      width: CONTROL_SIZE,
      height: CONTROL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarCenter: {
      width: CONTROL_SIZE,
      height: CONTROL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarBubble: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#A7B0AE' : '#B7BFBE',
    },
    avatarText: {
      color: '#F8FAFC',
      fontSize: 15,
      lineHeight: 16,
      fontWeight: '500',
      textAlign: 'center',
      fontFamily: Fonts.rounded,
    },
    searchIconWrap: {
      width: 24,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchInput: {
      flex: 1,
      height: '100%',
      color: palette.foreground,
      fontSize: 18,
      lineHeight: 22,
      paddingVertical: 0,
      margin: 0,
      fontFamily: Fonts.sans,
    },
    closeWrapper: {
      position: 'absolute',
      right: 0,
      width: BUTTON_OUTER_SIZE,
      height: BUTTON_OUTER_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.82,
    },
  });
}

const stylesStatic = StyleSheet.create({
  circleButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  circleButtonGlass: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    overflow: 'hidden',
  },
  circleButtonFallback: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    borderWidth: 1,
  },
  circleButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
