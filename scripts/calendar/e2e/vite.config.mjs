import path from "node:path";
import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")));
const { default: tailwind } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")));
export default defineConfig({
  root,
  optimizeDeps: { entries: ["scripts/calendar/e2e/index.html"] },
  configFile: false,
  envDir: false,
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": path.join(root, "apps/web/src") } },
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:1498") },
  server: { host: "127.0.0.1", port: 1498, strictPort: true },
});
