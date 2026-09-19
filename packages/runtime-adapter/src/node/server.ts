import { createNodeRuntime, type NodeRuntimeOptions } from "./node-runtime";

export async function startNodeServer(options: NodeRuntimeOptions) {
  const runtime = createNodeRuntime(options);
  const autoMigrate = process.env.ZILOBASE_AUTO_MIGRATE === "true";
  if (autoMigrate) await runtime.migrate();
  await runtime.start();
  return runtime;
}
