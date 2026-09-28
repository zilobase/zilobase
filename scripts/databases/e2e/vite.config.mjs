import path from "node:path";
import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")));

export default defineConfig({
  root,
  optimizeDeps: { entries: ["scripts/databases/e2e/index.html"] },
  configFile: false,
  envDir: false,
  plugins: [react()],
  resolve: { alias: { "@": path.join(root, "apps/web/src") } },
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:1499") },
  server: { host: "127.0.0.1", port: 1499, strictPort: true },
});
