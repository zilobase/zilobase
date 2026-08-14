import { Hono } from "hono";

import type { AppBindings } from "../../types";
import { getZilobaseDiscoveryDocument } from "./service";

export const instanceRoutes = new Hono<AppBindings>();

instanceRoutes.get("/.well-known/zilobase", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await getZilobaseDiscoveryDocument(c.env));
});
