
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


export function actionFailure(error: unknown, actionId: string | null = null) {
  if (error instanceof AutomationActionError) {
    return new AutomationActionError(error.message, error.code, error.actionId ?? actionId);
  }
  return new AutomationActionError(
    error instanceof Error ? error.message.slice(0, 2_000) : "Automation action failed",
    "AUTOMATION_ACTION_FAILED",
    actionId,
  );
}
