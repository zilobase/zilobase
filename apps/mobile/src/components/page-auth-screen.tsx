import { useSession, useSignOut } from '@notelab/features/auth';
import {
  type Workspace,
  useCreateWorkspace,
  useWorkspaces,
  useSetActiveWorkspace,
} from '@notelab/features/workspaces';
import * as React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AuthField, AuthFieldLabel, AuthInput } from '@/components/auth-form';
import { TopBar, TopBarInset } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Fonts, Spacing } from '@/constants/theme';
import { type ThemePalette, useThemedStyles } from '@/hooks/use-app-theme';
import { getApiErrorMessage } from '@/lib/api';

type PageAuthPalette = ThemePalette;
type PageStep = 'select' | 'create';

export function PageAuthScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { palette, styles } = useThemedStyles(createStyles);
  const session = useSession();
  const { data: rawWorkspaces = [], isPending: isWorkspacesPending } = useWorkspaces();
  const workspaces = rawWorkspaces.filter(Boolean);
  const createWorkspace = useCreateWorkspace();
  const setActiveWorkspace = useSetActiveWorkspace();
  const signOut = useSignOut();
  const [pageName, setPageName] = React.useState('');
  const [selectedPageId, setSelectedPageId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const activePageId = session.data?.session?.activeWorkspaceId ?? null;
  const hasExistingPages = workspaces.length > 0;
  const [stepOverride, setStepOverride] = React.useState<PageStep | null>(null);
  const step = hasExistingPages ? stepOverride ?? 'select' : 'create';
  const resolvedSelectedPageId =
    selectedPageId ??
    (activePageId && workspaces.some((workspace) => workspace.id === activePageId)
      ? activePageId
      : workspaces[0]?.id ?? null);
  const isCreating = createWorkspace.isPending;
  const isSelecting = setActiveWorkspace.isPending;
  const isBusy = isCreating || isSelecting || signOut.isPending;
  const activeError =
    formError ??
    (createWorkspace.error
      ? getApiErrorMessage(createWorkspace.error)
      : setActiveWorkspace.error
        ? getApiErrorMessage(setActiveWorkspace.error)
        : signOut.error
          ? getApiErrorMessage(signOut.error)
          : null);

  const handleCreatePage = React.useCallback(async () => {
    const name = pageName.trim();

    if (!name) {
      setFormError('Name your page to continue.');
      return;
    }

    setFormError(null);

    try {
      await createWorkspace.mutateAsync(name);
      setPageName('');
      onComplete();
    } catch {
      // React Query owns the visible error state.
    }
  }, [createWorkspace, onComplete, pageName]);

  const handleContinue = React.useCallback(async () => {
    if (!resolvedSelectedPageId) {
      setFormError('Select a page to continue.');
      return;
    }

    setFormError(null);

    try {
      if (resolvedSelectedPageId !== activePageId) {
        await setActiveWorkspace.mutateAsync(resolvedSelectedPageId);
      }

      onComplete();
    } catch {
      // React Query owns the visible error state.
    }
  }, [activePageId, onComplete, resolvedSelectedPageId, setActiveWorkspace]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopBar
        authBack={{
          visible: hasExistingPages && step === 'create',
          onPress: () => {
            setFormError(null);
            setPageName('');
            setStepOverride('select');
          },
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            {isWorkspacesPending ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={palette.foreground} />
                <Text style={styles.loadingText}>Loading your pages...</Text>
              </View>
            ) : (
              <>
            <View style={styles.header}>
              <Text variant="h1" style={styles.title}>
                {step === 'create' ? 'Create your page' : 'Choose your page'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 'create'
                  ? hasExistingPages
                    ? 'Set up a new page, then come right back into the app.'
                    : 'Your account is ready. Create the first page to land inside the app.'
                  : 'Pick the page you want to open right now, or head to a dedicated page to create another one.'}
              </Text>
            </View>

            {step === 'select' ? (
              <View style={styles.form}>
                <View style={styles.pageList}>
                  {workspaces.map((workspace) => {
                    const isSelected = workspace.id === resolvedSelectedPageId;

                    return (
                      <PageCard
                        key={workspace.id}
                        isSelected={isSelected}
                        onPress={() => {
                          setFormError(null);
                          setSelectedPageId(workspace.id);
                        }}
                        workspace={workspace}
                      />
                    );
                  })}
                </View>

                <PrimaryButton
                  disabled={isSelecting || !resolvedSelectedPageId}
                  label={isSelecting ? 'Opening page...' : 'Continue'}
                  onPress={handleContinue}
                />

                <SecondaryButton
                  disabled={isBusy}
                  label="Create new page"
                  onPress={() => {
                    setFormError(null);
                    setPageName('');
                    setStepOverride('create');
                  }}
                />
              </View>
            ) : (
              <View style={styles.form}>
                <AuthField>
                  <AuthFieldLabel label="Page name" />
                  <AuthInput
                    autoCapitalize="words"
                    autoComplete="workspace"
                    editable={!isBusy}
                    onChangeText={setPageName}
                    placeholder="Acme Design"
                    value={pageName}
                  />
                </AuthField>

                <PrimaryButton
                  disabled={isCreating}
                  label={isCreating ? 'Creating page...' : 'Create page'}
                  onPress={handleCreatePage}
                />
              </View>
            )}

            {!!activeError && <Text style={styles.errorText}>{activeError}</Text>}

            <View style={styles.footer}>
              <Pressable
                disabled={signOut.isPending}
                onPress={() => signOut.mutate()}
                style={styles.signOutLink}>
                <Text style={styles.signOutText}>
                  {signOut.isPending ? 'Signing out...' : 'Use another account'}
                </Text>
              </Pressable>
            </View>

            {(isCreating || isSelecting) && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={palette.foreground} />
                <Text style={styles.loadingText}>
                  {isSelecting ? 'Opening your page...' : 'Saving your page...'}
                </Text>
              </View>
            )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PageCard({
  isSelected,
  onPress,
  workspace,
}: {
  isSelected: boolean;
  onPress: () => void;
  workspace: Workspace;
}) {
  const { styles } = useThemedStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pageCard, isSelected && styles.pageCardSelected]}>
      <View style={[styles.pageBadge, isSelected && styles.pageBadgeSelected]}>
        <Text style={[styles.pageBadgeText, isSelected && styles.pageBadgeTextSelected]}>
          {getPageInitials(workspace.name)}
        </Text>
      </View>

      <View style={styles.pageCopy}>
        <Text style={styles.pageName}>{workspace.name}</Text>
        <Text style={styles.pageSlug}>{workspace.slug}</Text>
      </View>

      <View style={[styles.selectionDot, isSelected && styles.selectionDotActive]} />
    </Pressable>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button className="w-full" disabled={disabled} onPress={onPress} size="default">
      <Text>{label}</Text>
    </Button>
  );
}

function SecondaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button className="w-full" disabled={disabled} onPress={onPress} size="default" variant="outline">
      <Text>{label}</Text>
    </Button>
  );
}

function getPageInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials || 'N';
}

function createStyles(
  palette: PageAuthPalette,
  isDark: boolean
) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-start',
      paddingHorizontal: Spacing.four,
      paddingTop: TopBarInset,
      paddingBottom: Spacing.five,
      gap: Spacing.four,
    },
    shell: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      gap: 28,
    },
    header: {
      gap: 8,
    },
    title: {
      textAlign: 'left',
      color: palette.foreground,
      fontFamily: Fonts.sans,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '700',
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: palette.mutedForeground,
    },
    form: {
      gap: 16,
    },
    pageList: {
      gap: 12,
    },
    pageCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    pageCardSelected: {
      borderColor: palette.foreground,
      backgroundColor: palette.secondary,
      shadowColor: palette.foreground,
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    pageBadge: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.secondary,
      borderWidth: 1,
      borderColor: palette.border,
    },
    pageBadgeSelected: {
      backgroundColor: palette.foreground,
      borderColor: palette.foreground,
    },
    pageBadgeText: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 13,
    },
    pageBadgeTextSelected: {
      color: palette.background,
    },
    pageCopy: {
      flex: 1,
      gap: 2,
    },
    pageName: {
      color: palette.foreground,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '600',
    },
    pageSlug: {
      color: palette.mutedForeground,
      fontSize: 13,
      lineHeight: 18,
    },
    selectionDot: {
      width: 18,
      height: 18,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: palette.border,
      backgroundColor: 'transparent',
    },
    selectionDotActive: {
      borderColor: palette.foreground,
      backgroundColor: palette.foreground,
    },
    errorText: {
      color: palette.destructive,
      fontSize: 14,
      lineHeight: 20,
    },
    footer: {
      alignItems: 'center',
      paddingTop: 4,
    },
    signOutLink: {
      paddingVertical: 2,
    },
    signOutText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      color: palette.mutedForeground,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    loadingText: {
      fontSize: 14,
      color: palette.mutedForeground,
    },
  });
}
