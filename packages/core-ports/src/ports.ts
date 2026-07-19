/**
 * A typed handle for an extension point. The generic parameter `T` is the
 * contract an implementation must satisfy; it exists only at the type level
 * (`__type` is never present at runtime). Editions register implementations
 * against these keys via `@zilobase/registry`.
 */
export interface PortKey<T> {
  readonly id: string;
  /** Phantom type marker — never assigned at runtime. */
  readonly __type?: T;
}

export function definePort<T>(id: string): PortKey<T> {
  return { id };
}

// --- Port contracts -------------------------------------------------------
// Kept intentionally minimal (Parnas: interfaces reveal the least possible).
// Extend these as editions grow; adding a method is a deliberate contract
// change, not an accident of one caller's needs.

export interface AuditEvent {
  readonly actorId: string;
  readonly action: string;
  readonly target?: string;
  readonly workspaceId?: string;
  /** epoch ms */
  readonly at: number;
  readonly metadata?: Record<string, unknown>;
}

/** Sink for governance audit events. Community default is a no-op. */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export interface SsoAuthorization {
  readonly redirectUrl: string;
}

/** Enterprise SSO entry point (SAML / enterprise OIDC). */
export interface AuthProvider {
  readonly id: string;
  authorize(input: {
    workspaceId: string;
    returnUrl: string;
  }): Promise<SsoAuthorization>;
}

export const AuditSinkPort: PortKey<AuditSink> = definePort<AuditSink>("audit-sink");
export const AuthProviderPort: PortKey<AuthProvider> =
  definePort<AuthProvider>("auth-provider");
