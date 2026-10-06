import { Schema } from "effect";
import { parseArgs } from "node:util";
import { runWithDbEnv } from "../infrastructure/database";
import { getBackgroundCellId } from "../infrastructure/background/contracts";
import {
  previewBackgroundCutover,
  applyBackgroundCutover,
} from "../app/background/operations/cutover";
import {
  inspectBackgroundFailures,
  replayBackgroundFailure,
} from "../app/background/operations/replay";
import { purgeNodeCellQueues, purgeCloudflareCellQueues } from "@zilobase/runtime-adapter/node";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cell: { type: "string" },
    cutoff: { type: "string" },
    runtime: { type: "string", default: "node" },
    apply: { type: "boolean", default: false },
    "runtimes-stopped": { type: "boolean", default: false },
    "isolated-cell-database": { type: "boolean", default: false },
    "task-id": { type: "string" },
    limit: { type: "string", default: "50" },
  },
});
const command = Schema.decodeUnknownSync(Schema.Literals(["inspect", "replay", "cutover"]))(
  positionals[0],
);
if (positionals.length !== 1) throw new Error("One background operation is required");
const env = process.env;
if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED_FOR_BACKGROUND_OPERATIONS");
const cellId = Schema.decodeUnknownSync(Schema.String)(values.cell);
if (!cellId || cellId !== getBackgroundCellId(env)) throw new Error("OPERATIONS_CELL_MISMATCH");
const runtime = Schema.decodeUnknownSync(Schema.Literals(["node", "worker"]))(values.runtime);
if (command === "replay" && !values.apply) throw new Error("REPLAY_REQUIRES_EXPLICIT_APPLY");
const output = await runWithDbEnv(env, async () => {
  if (command === "inspect") {
    const limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new Error("OPERATIONS_LIMIT_INVALID");
    return { cellId, failures: await inspectBackgroundFailures(env, limit) };
  }
  if (command === "replay") {
    if (!values["task-id"] || !/^[a-f0-9-]{36}$/i.test(values["task-id"]))
      throw new Error("OPERATIONS_TASK_ID_INVALID");
    return {
      ...(await replayBackgroundFailure(env, values["task-id"])),
      publication: "maintenance",
    };
  }
  const raw = values.cutoff;
  if (!raw || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString() !== raw)
    throw new Error("CUTOVER_CANONICAL_ISO_CUTOFF_REQUIRED");
  const options = {
    cellId,
    cutoff: new Date(raw),
    isolatedDatabase: values["isolated-cell-database"],
    runtimesStopped: values["runtimes-stopped"],
  };
  if (!values.apply) return previewBackgroundCutover(env, options);
  return applyBackgroundCutover(env, options, async () => {
    if (runtime === "node") await purgeNodeCellQueues(env, cellId);
    else await purgeCloudflareCellQueues(env, cellId);
  });
});
console.info(JSON.stringify(output, null, 2));
