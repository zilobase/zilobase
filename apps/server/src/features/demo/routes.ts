import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../../infrastructure/database";
import { workspace } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import {
  DEMO_IDS,
  DEMO_SEED_VERSION,
  DEMO_START_PATH,
} from "./constants";
import { requireDemoContext } from "./request";

export const demoRoutes = new Hono<AppBindings>();

demoRoutes.get("/bootstrap", async (c) => {
  if (!requireDemoContext(c)) {
    return c.json({ error: "Not found" }, 404);
  }

  const [demoWorkspace] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, DEMO_IDS.workspace))
    .limit(1);

  if (!demoWorkspace) {
    return c.json(
      { code: "DEMO_UNAVAILABLE", error: "The hosted demo is unavailable." },
      503,
    );
  }

  return c.json({
    demoMode: true,
    seedVersion: DEMO_SEED_VERSION,
    startPath: DEMO_START_PATH,
    workspace: demoWorkspace,
  });
});
