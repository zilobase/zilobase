import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { clientOrigins, port } from "./config";
import { sessionMiddleware } from "./middleware/session";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { sessionRoutes } from "./routes/session";
import { workspaceRoutes } from "./routes/workspaces";
import type { AppBindings } from "./types";

const app = new Hono<AppBindings>();

app.use(
  "*",
  cors({
    origin: clientOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

app.route("/", authRoutes);
app.route("/", healthRoutes);
app.route("/session", sessionRoutes);
app.route("/workspaces", workspaceRoutes);

serve({ fetch: app.fetch, port });

console.info(`Notelab server listening on http://localhost:${port}`);

export default app;
