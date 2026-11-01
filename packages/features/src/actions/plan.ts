/*
 * Action plans are pure, ordered operation calls shared by every executor.
 * Planners decide what to do; runPlan decides how to wait. Client callers may
 * admit steps optimistically, while server executors run every step to its
 * acknowledgement so retries and receipts stay deterministic.
 */

// oxlint-disable-next-line typescript/no-explicit-any -- operation inputs are contravariant
export type PlanOps = Record<string, (input: any) => Promise<unknown>>;
type OpInput<F> = F extends (input: infer Input) => Promise<unknown> ? Input : never;
type OpResult<F> = F extends (input: never) => Promise<infer Result> ? Result : never;

/** "ack" awaits confirmation, "optimistic" continues once previewed, "dispatch" never waits. */
export type PlanAdmission = "ack" | "optimistic" | "dispatch";

export type PlanStep<O extends PlanOps> = {
  [K in keyof O & string]: {
    /** Results of later steps are addressed by ID. */
    id?: string;
    op: K;
    input: (done: PlanResults) => Omit<OpInput<O[K]>, "onOptimistic">;
    admit?: PlanAdmission;
    /** User-facing message reported when this step fails. */
    failure?: string;
    /** Exclusive key: a plan is refused while another step with this key is running. */
    key?: string;
  };
}[keyof O & string];

export type ActionPlan<O extends PlanOps> = {
  steps: PlanStep<O>[];
  /** Step whose admitted result identifies a created resource to select. */
  select?: string;
};
/** `message` is user-facing; reasons without one are silent guards. */
export type PlanRejection = { rejected: string; message?: string };
export type PlanOutcome<O extends PlanOps> = ActionPlan<O> | PlanRejection;

export function rejectPlan(reason: string, message?: string): PlanRejection {
  return message ? { rejected: reason, message } : { rejected: reason };
}

export function isPlanRejection<O extends PlanOps>(
  outcome: PlanOutcome<O>,
): outcome is PlanRejection {
  return "rejected" in outcome;
}

export class PlanResults {
  private readonly values = new Map<string, unknown>();
  has(id: string) {
    return this.values.has(id);
  }
  get<T>(id: string): T {
    if (!this.values.has(id)) throw new Error(`Plan step ${id} has no result`);
    return this.values.get(id) as T;
  }
  set(id: string, value: unknown) {
    this.values.set(id, value);
  }
}

export type PlanRun = {
  status: "completed" | "failed" | "stopped";
  results: PlanResults;
  /** The first failure of an awaited step. */
  error?: unknown;
  /** Every failure, including dispatched steps. */
  errors: unknown[];
  /** Result of the final step, when it completed. */
  last?: unknown;
};

export type RunPlanOptions = {
  /** Await every acknowledgement in order and never pass optimistic callbacks. */
  sequential?: boolean;
  isCurrent?: () => boolean;
  onFailure?: (message: string, error: unknown) => void;
  onSelect?: (result: unknown) => void;
  onStepStart?: (step: { id: string; op: string; key?: string }) => void;
  onStepSettled?: (step: { id: string; op: string; key?: string }, error?: unknown) => void;
};

export function runPlan<O extends PlanOps>(
  plan: ActionPlan<O>,
  ops: O,
  options: RunPlanOptions = {},
): Promise<PlanRun> {
  const isCurrent = options.isCurrent ?? (() => true);
  const results = new PlanResults();
  const errors: unknown[] = [];
  let selected = false;
  let error: unknown;
  let last: unknown;
  const select = (id: string, value: unknown) => {
    if (selected || plan.select !== id || !isCurrent()) return;
    selected = true;
    options.onSelect?.(value);
  };

  return new Promise<PlanRun>((resolveRun) => {
    let status: PlanRun["status"] | undefined;
    let outstanding = 0;
    const complete = () => {
      if (!status || outstanding > 0) return;
      resolveRun({
        status: status === "completed" && error !== undefined ? "failed" : status,
        results,
        error,
        errors,
        last,
      });
    };
    const finish = (next: PlanRun["status"]) => {
      if (status) return;
      status = next;
      complete();
    };

    /*
     * Steps advance from operation callbacks, so dependent work starts in the
     * same turn as its admission, exactly like chained UI callbacks. Steps
     * before the first wait run synchronously in the caller's turn.
     */
    const advance = (index: number) => {
      for (let position = index; position < plan.steps.length; position += 1) {
        if (!isCurrent()) return finish("stopped");
        const step = plan.steps[position]!;
        const id = step.id ?? `step-${position}`;
        const meta = { id, op: step.op, key: step.key };
        const admit = options.sequential ? "ack" : (step.admit ?? "ack");
        let continued = admit === "dispatch";
        const proceed = () => {
          if (continued) return;
          continued = true;
          advance(position + 1);
        };
        const input = step.input(results);
        options.onStepStart?.(meta);
        outstanding += 1;
        const operation = ops[step.op] as (input: unknown) => Promise<unknown>;
        let started: Promise<unknown>;
        try {
          started = operation(
            admit === "optimistic"
              ? {
                  ...input,
                  onOptimistic: (value: unknown) => {
                    if (!results.has(id)) results.set(id, value);
                    select(id, value);
                    proceed();
                  },
                }
              : input,
          );
        } catch (cause) {
          started = Promise.reject(cause);
        }
        void started.then(
          (value) => {
            results.set(id, value);
            if (position === plan.steps.length - 1) last = value;
            select(id, value);
            options.onStepSettled?.(meta);
            outstanding -= 1;
            proceed();
            complete();
          },
          (cause: unknown) => {
            errors.push(cause);
            if (admit !== "dispatch") error ??= cause;
            options.onStepSettled?.(meta, cause);
            if (step.failure && isCurrent()) options.onFailure?.(step.failure, cause);
            outstanding -= 1;
            if (!continued) {
              continued = true;
              finish("failed");
            }
            complete();
          },
        );
        if (admit !== "dispatch") return;
      }
      finish("completed");
    };
    advance(0);
  });
}
