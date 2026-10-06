import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")));
const { default: tailwindcss } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")));
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  plugins: [tailwindcss(), react()],
  envDir: false,
  optimizeDeps: { entries: ["scripts/editor/e2e/index.html"] },
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:1502") },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../apps/web/src", import.meta.url)),
      "@zilobase/edition-web": fileURLToPath(
        new URL("../../../apps/web/src/edition/community-module.ts", import.meta.url),
      ),
    },
  },
  server: { host: "127.0.0.1", port: 1502, strictPort: true },
});
