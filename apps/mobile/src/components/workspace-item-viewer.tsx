import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/ui/text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { authClient } from '@/lib/auth-client';
import { THEME } from '@/lib/theme';
import type { MobileViewerItem } from '@/providers/mobile-viewer-provider';
import React from 'react';

function createMobileWebViewBootstrap(cookie: string | undefined) {
  const serializedCookie = JSON.stringify(cookie ?? '');

  return `
  (function () {
    window.__NOTELAB_MOBILE_AUTH_COOKIE__ = ${serializedCookie};
    var viewportContent = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    var meta = document.querySelector('meta[name="viewport"]');

    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }

    meta.setAttribute('content', viewportContent);

    function applyMobileViewerMetrics() {
      var viewport = window.visualViewport;
      var viewportHeight = viewport ? viewport.height : window.innerHeight;
      var viewportOffsetTop = viewport ? viewport.offsetTop : 0;
      var keyboardInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;

      document.documentElement.classList.add('mobile-webview-embedded');
      document.documentElement.style.setProperty('--mobile-webview-vh', viewportHeight + 'px');
      document.documentElement.style.setProperty('--mobile-webview-keyboard-inset', keyboardInset + 'px');
      document.documentElement.style.setProperty('--mobile-webview-offset-top', viewportOffsetTop + 'px');
    }

    window.addEventListener('resize', applyMobileViewerMetrics);
    window.addEventListener('orientationchange', applyMobileViewerMetrics);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', applyMobileViewerMetrics);
      window.visualViewport.addEventListener('scroll', applyMobileViewerMetrics);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyMobileViewerMetrics, { once: true });
    } else {
      applyMobileViewerMetrics();
    }

    true;
  })();
`;
}

export function WorkspaceItemViewer({ item }: { item: MobileViewerItem }) {
  const colorScheme = useColorScheme();
  const palette = THEME[colorScheme === 'dark' ? 'dark' : 'light'];
  const cookie = authClient.getCookie();
  const webViewBackground = colorScheme === 'dark' ? '#09090B' : palette.background;
  const bootstrapScript = React.useMemo(() => createMobileWebViewBootstrap(cookie), [cookie]);
  const source = {
    uri: item.url,
    headers: cookie ? { cookie } : undefined,
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.webViewContainer, { backgroundColor: webViewBackground }]}>
        <WebView
          source={source}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState
          scalesPageToFit={false}
          injectedJavaScriptBeforeContentLoaded={bootstrapScript}
          injectedJavaScriptForMainFrameOnly
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          style={{ backgroundColor: webViewBackground }}
          containerStyle={{ backgroundColor: webViewBackground }}
          renderError={() => (
            <View style={[styles.loadingState, { backgroundColor: webViewBackground }]}>
              <Text style={[styles.loadingText, { color: palette.mutedForeground }]}>
                Could not load {item.title}.
              </Text>
            </View>
          )}
          renderLoading={() => (
            <View style={[styles.loadingState, { backgroundColor: webViewBackground }]}>
              <ActivityIndicator color={palette.foreground} />
              <Text style={[styles.loadingText, { color: palette.mutedForeground }]}>
                Opening {item.title}...
              </Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    lineHeight: 20,
  },
});
