import { useSession, useSignOut } from '@notelab/features/auth';
import {
  type Organization,
  useCreateOrganization,
  useOrganizations,
  useSetActiveOrganization,
} from '@notelab/features/organizations';
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

import { TopBar, TopBarInset } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Fonts, Spacing } from '@/constants/theme';
import { type ThemePalette, useThemedStyles } from '@/hooks/use-app-theme';
import { getApiErrorMessage } from '@/lib/api';

type WorkspaceAuthPalette = ThemePalette;
type WorkspaceStep = 'select' | 'create';

export function WorkspaceAuthScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { palette, styles } = useThemedStyles(createStyles);
  const session = useSession();
  const { data: organizations = [], isPending: isOrganizationsPending } = useOrganizations();
  const createOrganization = useCreateOrganization();
  const setActiveOrganization = useSetActiveOrganization();
  const signOut = useSignOut();
  const [workspaceName, setWorkspaceName] = React.useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const activeWorkspaceId = session.data?.session?.activeOrganizationId ?? null;
  const hasExistingWorkspaces = organizations.length > 0;
  const [stepOverride, setStepOverride] = React.useState<WorkspaceStep | null>(null);
  const step = hasExistingWorkspaces ? stepOverride ?? 'select' : 'create';
  const resolvedSelectedWorkspaceId =
    selectedWorkspaceId ??
    (activeWorkspaceId && organizations.some((organization) => organization.id === activeWorkspaceId)
      ? activeWorkspaceId
      : organizations[0]?.id ?? null);
  const isCreating = createOrganization.isPending;
  const isSelecting = setActiveOrganization.isPending;
  const isBusy = isCreating || isSelecting || signOut.isPending;
  const activeError =
    formError ??
    (createOrganization.error
      ? getApiErrorMessage(createOrganization.error)
      : setActiveOrganization.error
        ? getApiErrorMessage(setActiveOrganization.error)
        : signOut.error
          ? getApiErrorMessage(signOut.error)
          : null);

  const handleCreateWorkspace = React.useCallback(async () => {
    const name = workspaceName.trim();

    if (!name) {
      setFormError('Name your workspace to continue.');
      return;
    }

    setFormError(null);

    try {
      await createOrganization.mutateAsync(name);
      setWorkspaceName('');
      onComplete();
    } catch {
      // React Query owns the visible error state.
    }
  }, [createOrganization, onComplete, workspaceName]);

  const handleContinue = React.useCallback(async () => {
    if (!resolvedSelectedWorkspaceId) {
      setFormError('Select a workspace to continue.');
      return;
    }

    setFormError(null);

    try {
      if (resolvedSelectedWorkspaceId !== activeWorkspaceId) {
        await setActiveOrganization.mutateAsync(resolvedSelectedWorkspaceId);
      }

      onComplete();
    } catch {
      // React Query owns the visible error state.
    }
  }, [activeWorkspaceId, onComplete, resolvedSelectedWorkspaceId, setActiveOrganization]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopBar
        authBack={{
          visible: hasExistingWorkspaces && step === 'create',
          onPress: () => {
            setFormError(null);
            setWorkspaceName('');
            setStepOverride('select');
          },
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            {isOrganizationsPending ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={palette.foreground} />
                <Text style={styles.loadingText}>Loading your workspaces...</Text>
              </View>
            ) : (
              <>
            <View style={styles.header}>
              <Text variant="h1" style={styles.title}>
                {step === 'create' ? 'Create your workspace' : 'Choose your workspace'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 'create'
                  ? hasExistingWorkspaces
                    ? 'Set up a new workspace, then come right back into the app.'
                    : 'Your account is ready. Create the first workspace to land inside the app.'
                  : 'Pick the workspace you want to open right now, or head to a dedicated page to create another one.'}
              </Text>
            </View>

            {step === 'select' ? (
              <View style={styles.form}>
                <View style={styles.workspaceList}>
                  {organizations.map((organization) => {
                    const isSelected = organization.id === resolvedSelectedWorkspaceId;

                    return (
                      <WorkspaceCard
                        key={organization.id}
                        isSelected={isSelected}
                        onPress={() => {
                          setFormError(null);
                          setSelectedWorkspaceId(organization.id);
                        }}
                        organization={organization}
                      />
                    );
                  })}
                </View>

                <PrimaryButton
                  disabled={isSelecting || !resolvedSelectedWorkspaceId}
                  label={isSelecting ? 'Opening workspace...' : 'Continue'}
                  onPress={handleContinue}
                />

                <SecondaryButton
                  disabled={isBusy}
                  label="Create new workspace"
                  onPress={() => {
                    setFormError(null);
                    setWorkspaceName('');
                    setStepOverride('create');
                  }}
                />
              </View>
            ) : (
              <View style={styles.form}>
                <Field>
                  <FieldLabel label="Workspace name" />
                  <Input
                    autoCapitalize="words"
                    autoComplete="organization"
                    editable={!isBusy}
                    onChangeText={setWorkspaceName}
                    placeholder="Acme Design"
                    value={workspaceName}
                  />
                </Field>

                <PrimaryButton
                  disabled={isCreating}
                  label={isCreating ? 'Creating workspace...' : 'Create workspace'}
                  onPress={handleCreateWorkspace}
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
                  {isSelecting ? 'Opening your workspace...' : 'Saving your workspace...'}
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

function WorkspaceCard({
  isSelected,
  onPress,
  organization,
}: {
  isSelected: boolean;
  onPress: () => void;
  organization: Organization;
}) {
  const { styles } = useThemedStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.workspaceCard, isSelected && styles.workspaceCardSelected]}>
      <View style={[styles.workspaceBadge, isSelected && styles.workspaceBadgeSelected]}>
        <Text style={[styles.workspaceBadgeText, isSelected && styles.workspaceBadgeTextSelected]}>
          {getWorkspaceInitials(organization.name)}
        </Text>
      </View>

      <View style={styles.workspaceCopy}>
        <Text style={styles.workspaceName}>{organization.name}</Text>
        <Text style={styles.workspaceSlug}>{organization.slug}</Text>
      </View>

      <View style={[styles.selectionDot, isSelected && styles.selectionDotActive]} />
    </Pressable>
  );
}

function FieldLabel({ label }: { label: string }) {
  const { styles } = useThemedStyles(createStyles);

  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function Field({ children }: React.PropsWithChildren) {
  const { styles } = useThemedStyles(createStyles);

  return <View style={styles.field}>{children}</View>;
}

function Input({ style, ...props }: React.ComponentProps<typeof TextInput>) {
  const { palette, styles } = useThemedStyles(createStyles);
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <TextInput
      placeholderTextColor={palette.mutedForeground}
      selectionColor={palette.foreground}
      style={[styles.input, isFocused && styles.inputFocused, style]}
      onBlur={(event) => {
        setIsFocused(false);
        props.onBlur?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        props.onFocus?.(event);
      }}
      {...props}
    />
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

function getWorkspaceInitials(name: string) {
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
  palette: WorkspaceAuthPalette,
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
    workspaceList: {
      gap: 12,
    },
    workspaceCard: {
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
    workspaceCardSelected: {
      borderColor: palette.foreground,
      backgroundColor: palette.secondary,
      shadowColor: palette.foreground,
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    workspaceBadge: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.secondary,
      borderWidth: 1,
      borderColor: palette.border,
    },
    workspaceBadgeSelected: {
      backgroundColor: palette.foreground,
      borderColor: palette.foreground,
    },
    workspaceBadgeText: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 13,
    },
    workspaceBadgeTextSelected: {
      color: palette.background,
    },
    workspaceCopy: {
      flex: 1,
      gap: 2,
    },
    workspaceName: {
      color: palette.foreground,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '600',
    },
    workspaceSlug: {
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
    field: {
      gap: 8,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: palette.foreground,
    },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      lineHeight: 20,
      fontFamily: Fonts.sans,
      fontWeight: '400',
      color: palette.foreground,
    },
    inputFocused: {
      borderColor: palette.foreground,
      shadowColor: palette.foreground,
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
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
