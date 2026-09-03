
export class AutomationActionError extends Error {
  constructor(
    message: string,
    readonly code = "AUTOMATION_ACTION_FAILED",
    readonly actionId: string | null = null,
  ) {
    super(message);
    this.name = "AutomationActionError";
  }
}

export class RetryableAutomationActionError extends AutomationActionError {
  constructor(
    message: string,
    code: string,
    readonly availableAt: Date,
    actionId: string | null = null,
  ) {
    super(message, code, actionId);
    this.name = "RetryableAutomationActionError";
  }
}


export function actionFailure(error: unknown, actionId: string | null = null) {
  if (error instanceof RetryableAutomationActionError) {
    return new RetryableAutomationActionError(
      error.message,
      error.code,
      error.availableAt,
      error.actionId ?? actionId,
    );
  }
  if (error instanceof AutomationActionError) {
    return new AutomationActionError(error.message, error.code, error.actionId ?? actionId);
  }
  return new AutomationActionError(
    error instanceof Error ? error.message.slice(0, 2_000) : "Automation action failed",
    "AUTOMATION_ACTION_FAILED",
    actionId,
  );
}
