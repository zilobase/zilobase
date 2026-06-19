import {
  useRequestEmailVerificationOtp,
  useRequestSignInOtp,
  useSignInWithOtp,
  useSignUp,
  useVerifyEmailOtp,
} from '@notelab/features/auth';
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
import { API_BASE_URL } from '@/lib/api-base-url';

type AuthStep = 'landing' | 'login' | 'signup';
type OtpPurpose = 'sign-in' | 'email-verification';

type OtpState = {
  email: string;
  purpose: OtpPurpose;
};

type AuthPalette = ThemePalette;

export function AuthScreen() {
  const { palette, styles } = useThemedStyles(createStyles);
  const [step, setStep] = React.useState<AuthStep>('landing');
  const [otpState, setOtpState] = React.useState<OtpState | null>(null);
  const [loginEmail, setLoginEmail] = React.useState('');
  const [signupName, setSignupName] = React.useState('');
  const [signupEmail, setSignupEmail] = React.useState('');
  const [signupPassword, setSignupPassword] = React.useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = React.useState('');
  const [otpCode, setOtpCode] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [resendCount, setResendCount] = React.useState(0);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const otpInputRef = React.useRef<TextInput>(null);

  const requestSignInOtp = useRequestSignInOtp();
  const signUp = useSignUp();
  const requestEmailVerificationOtp = useRequestEmailVerificationOtp();
  const signInWithOtp = useSignInWithOtp();
  const verifyEmailOtp = useVerifyEmailOtp();

  const requestError = requestSignInOtp.error ?? signUp.error ?? requestEmailVerificationOtp.error;
  const verifyError = signInWithOtp.error ?? verifyEmailOtp.error;
  const mutationError = otpState ? verifyError : requestError;
  const activeError = formError ?? (mutationError ? getApiErrorMessage(mutationError) : null);
  const isSending =
    requestSignInOtp.isPending || signUp.isPending || requestEmailVerificationOtp.isPending;
  const isVerifying = signInWithOtp.isPending || verifyEmailOtp.isPending;
  const isResendDisabled = isSending || resendCooldown > 0;

  const resetLoginForm = React.useCallback(() => {
    setLoginEmail('');
  }, []);

  const resetSignupForm = React.useCallback(() => {
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupConfirmPassword('');
  }, []);

  const resetOtpFlow = React.useCallback(() => {
    setOtpState(null);
    setOtpCode('');
    setResendCount(0);
    setResendCooldown(0);
  }, []);

  React.useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setResendCooldown((currentValue) => Math.max(0, currentValue - 1));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [resendCooldown]);

  const handleSendLoginCode = React.useCallback(async () => {
    const email = loginEmail.trim().toLowerCase();

    if (!email) {
      setFormError('Enter your email to continue.');
      return;
    }

    setFormError(null);

    try {
      await requestSignInOtp.mutateAsync(email);
      resetLoginForm();
      setOtpCode('');
      setResendCount(0);
      setResendCooldown(30);
      setOtpState({ email, purpose: 'sign-in' });
    } catch {
      // Mutation state owns the visible error.
    }
  }, [loginEmail, requestSignInOtp, resetLoginForm]);

  const handleCreateAccount = React.useCallback(async () => {
    const name = signupName.trim();
    const email = signupEmail.trim().toLowerCase();

    if (!name || !email || !signupPassword || !signupConfirmPassword) {
      setFormError('Fill in every field to create your account.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setFormError(null);

    try {
      await signUp.mutateAsync({
        email,
        name,
        password: signupPassword,
      });
      await requestEmailVerificationOtp.mutateAsync(email);
      resetSignupForm();
      setOtpCode('');
      setResendCount(0);
      setResendCooldown(30);
      setOtpState({ email, purpose: 'email-verification' });
    } catch {
      // Mutation state owns the visible error.
    }
  }, [
    requestEmailVerificationOtp,
    resetSignupForm,
    signUp,
    signupConfirmPassword,
    signupEmail,
    signupName,
    signupPassword,
  ]);

  const handleVerifyOtp = React.useCallback(async () => {
    if (!otpState || otpCode.length !== 6) {
      setFormError('Enter the 6-digit code we sent you.');
      return;
    }

    setFormError(null);

    try {
      if (otpState.purpose === 'sign-in') {
        await signInWithOtp.mutateAsync({
          email: otpState.email,
          otp: otpCode,
        });
      } else {
        await verifyEmailOtp.mutateAsync({
          email: otpState.email,
          otp: otpCode,
        });
      }
    } catch {
      // Mutation state owns the visible error.
    }
  }, [otpCode, otpState, signInWithOtp, verifyEmailOtp]);

  const handleResendOtp = React.useCallback(async () => {
    if (!otpState) {
      return;
    }

    setFormError(null);

    try {
      if (otpState.purpose === 'sign-in') {
        await requestSignInOtp.mutateAsync(otpState.email);
      } else {
        await requestEmailVerificationOtp.mutateAsync(otpState.email);
      }

      setOtpCode('');
      setResendCount((count) => count + 1);
      setResendCooldown(30);
    } catch {
      // Mutation state owns the visible error.
    }
  }, [otpState, requestEmailVerificationOtp, requestSignInOtp]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopBar
        authBack={{
          visible: step !== 'landing' || !!otpState,
          onPress: () => {
            setFormError(null);

            if (otpState) {
              resetOtpFlow();
              return;
            }

            resetLoginForm();
            resetSignupForm();
            setStep('landing');
          },
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={styles.header}>
              <Text variant="h1" style={styles.title}>
                {otpState
                  ? 'Enter your code'
                  : step === 'landing'
                    ? 'Capture ideas without friction'
                    : step === 'login'
                      ? 'Welcome back'
                      : 'Create account'}
              </Text>
              <Text style={styles.subtitle}>
                {otpState
                  ? `We sent a 6-digit code to ${otpState.email}.`
                  : step === 'landing'
                    ? 'Choose how you want to continue. You can sign in or create a new account in a single tap.'
                  : step === 'login'
                    ? 'Sign in with your email and we will send a one-time code.'
                    : 'Create your account, then verify your email with a one-time code.'}
              </Text>
            </View>

            {!otpState && step === 'landing' ? (
              <View style={styles.form}>
                <View style={styles.spacer} />
                <View style={styles.bottomActions}>
                  <PrimaryButton
                    label="Log in"
                    onPress={() => {
                      setFormError(null);
                      resetLoginForm();
                      resetOtpFlow();
                      setStep('login');
                    }}
                  />
                  <SecondaryButton
                    label="Create new account"
                    onPress={() => {
                      setFormError(null);
                      resetSignupForm();
                      resetOtpFlow();
                      setStep('signup');
                    }}
                  />
                </View>
              </View>
            ) : !otpState ? (
              <>
                {step === 'login' ? (
                  <View style={styles.form}>
                    <Field>
                      <FieldLabel label="Email" />
                      <Input
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect={false}
                        keyboardType="email-address"
                        onChangeText={setLoginEmail}
                        placeholder="m@example.com"
                        spellCheck={false}
                        value={loginEmail}
                      />
                    </Field>

                    <PrimaryButton
                      disabled={isSending}
                      label={isSending ? 'Sending code...' : 'Send login code'}
                      onPress={handleSendLoginCode}
                    />
                  </View>
                ) : (
                  <View style={styles.form}>
                    <Field>
                      <FieldLabel label="Full name" />
                      <Input
                        autoComplete="name"
                        onChangeText={setSignupName}
                        placeholder="John Doe"
                        value={signupName}
                      />
                    </Field>

                    <Field>
                      <FieldLabel label="Email" />
                      <Input
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect={false}
                        keyboardType="email-address"
                        onChangeText={setSignupEmail}
                        placeholder="m@example.com"
                        spellCheck={false}
                        value={signupEmail}
                      />
                    </Field>

                    <Field>
                      <FieldLabel label="Password" />
                      <Input
                        autoComplete="password-new"
                        onChangeText={setSignupPassword}
                        placeholder="At least 8 characters"
                        secureTextEntry
                        value={signupPassword}
                      />
                    </Field>

                    <Field>
                      <FieldLabel label="Confirm password" />
                      <Input
                        autoComplete="password-new"
                        onChangeText={setSignupConfirmPassword}
                        placeholder="Repeat your password"
                        secureTextEntry
                        value={signupConfirmPassword}
                      />
                    </Field>

                    <PrimaryButton
                      disabled={isSending}
                      label={isSending ? 'Creating account...' : 'Create account'}
                      onPress={handleCreateAccount}
                    />
                  </View>
                )}
              </>
            ) : (
              <View style={styles.form}>
                <Field>
                  <FieldLabel label="Verification code" />
                  <OtpInput
                    inputRef={otpInputRef}
                    onChange={setOtpCode}
                    value={otpCode}
                  />
                </Field>

                <PrimaryButton
                  disabled={isVerifying || otpCode.length !== 6}
                  label={isVerifying ? 'Checking code...' : 'Continue'}
                  onPress={handleVerifyOtp}
                />

                <View style={styles.otpMeta}>
                  <Text style={styles.helperText}>Codes expire quickly for safety.</Text>
                  <Pressable
                    disabled={isResendDisabled}
                    onPress={handleResendOtp}
                    style={styles.resendLink}>
                    <Text
                      style={[
                        styles.resendText,
                        isResendDisabled && styles.resendTextDisabled,
                      ]}>
                      {isSending
                        ? 'Sending...'
                        : resendCooldown > 0
                          ? `Resend code in ${resendCooldown}s`
                          : resendCount > 0
                            ? 'Send another code'
                            : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {!!activeError && <Text style={styles.errorText}>{activeError}</Text>}

            <View style={styles.footer}>
              <Text style={styles.legalText}>
                By continuing, you agree to the Notelab terms and privacy policy.
              </Text>

              {__DEV__ && <Text style={styles.debugText}>Auth server: {API_BASE_URL}</Text>}
            </View>
          </View>

          {(isSending || isVerifying) && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.foreground} />
              <Text style={styles.loadingText}>Talking to your auth server...</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

function OtpInput({
  inputRef,
  onChange,
  value,
}: {
  inputRef: React.RefObject<TextInput | null>;
  onChange: (value: string) => void;
  value: string;
}) {
  const { styles } = useThemedStyles(createStyles);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, 5);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.otpWrapper}>
      <TextInput
        ref={inputRef}
        autoCapitalize="characters"
        autoCorrect={false}
        caretHidden
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(nextValue) => onChange(nextValue.replace(/\D/g, ''))}
        spellCheck={false}
        style={styles.otpHiddenInput}
        value={value}
      />
      <View style={styles.otpBoxes}>
        {digits.map((digit, index) => {
          const isActive = index === activeIndex && value.length < 6;

          return (
            <View
              key={index}
              style={[
                styles.otpBox,
                digit && styles.otpBoxFilled,
                isActive && styles.otpBoxActive,
              ]}>
              <Text style={styles.otpDigit}>{digit}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

function Input({
  style,
  ...props
}: React.ComponentProps<typeof TextInput>) {
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
    <Button
      className="w-full"
      disabled={disabled}
      onPress={onPress}
      size="default">
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
    <Button
      className="w-full"
      disabled={disabled}
      onPress={onPress}
      size="default">
      <Text>{label}</Text>
    </Button>
  );
}

function createStyles(
  palette: AuthPalette,
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
    gap: 32,
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
  spacer: {
    flex: 1,
    minHeight: 180,
  },
  bottomActions: {
    gap: 12,
    marginTop: 'auto',
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
    letterSpacing: 0,
    textAlign: 'left',
    color: palette.foreground,
  },
  inputFocused: {
    borderColor: palette.foreground,
    shadowColor: palette.foreground,
    shadowOpacity: isDark ? 0.18 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  otpWrapper: {
    position: 'relative',
  },
  otpHiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpBoxes: {
    flexDirection: 'row',
    gap: 10,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    borderColor: isDark ? palette.ring : palette.input,
  },
  otpBoxActive: {
    borderColor: palette.foreground,
    shadowColor: palette.foreground,
    shadowOpacity: isDark ? 0.18 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  otpDigit: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
    color: palette.foreground,
    fontVariant: ['tabular-nums'],
  },
  otpMeta: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.mutedForeground,
    textAlign: 'center',
  },
  resendLink: {
    paddingVertical: 2,
  },
  resendText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: palette.foreground,
  },
  resendTextDisabled: {
    color: palette.mutedForeground,
  },
  errorText: {
    color: palette.destructive,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    gap: 10,
    paddingTop: 4,
  },
  legalText: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.mutedForeground,
  },
  debugText: {
    fontSize: 12,
    lineHeight: 18,
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
