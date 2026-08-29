import { createDbClient, runWithDbClient } from "../infrastructure/database";
import { inspectTeamspaceIntegrity } from "../features/teamspaces/integrity";

const databaseClient = createDbClient(process.env);
const issues = await runWithDbClient(databaseClient, () =>
  inspectTeamspaceIntegrity(databaseClient.db),
);

if (issues.length === 0) {
  console.log("Teamspace integrity check passed.");
  process.exit(0);
}

console.error(JSON.stringify({ issues }, null, 2));
process.exitCode = 1;
