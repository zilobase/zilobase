import { Context, Effect, Layer, Schema } from "effect";

import type { RuntimeEnv } from "../../shared/config/config";
import { runWithDbEnv } from "./index";

export class DatabaseUnavailable extends Schema.TaggedError<DatabaseUnavailable>()(
  "DatabaseUnavailable",
  {
    cause: Schema.Unknown,
  },
) {}

export class Db extends Context.Service<
  Db,
  {
    withEnv<A>(env: RuntimeEnv, operation: () => Promise<A>): Effect.Effect<A, DatabaseUnavailable>;
  }
>()("@zilobase/server/infrastructure/database/Db") {
  static readonly layer = Layer.succeed(this, {
    withEnv: <A>(env: RuntimeEnv, operation: () => Promise<A>) =>
      Effect.tryPromise({
        try: () => runWithDbEnv(env, operation),
        catch: (cause) => new DatabaseUnavailable({ cause }),
      }).pipe(Effect.withSpan("Db.withEnv")),
  });
}
