import path from "node:path";
import { execFileSync } from "node:child_process";
import { defineConfig, transformWithEsbuild } from "vite";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "../../..");
const webRequire = createRequire(path.join(root, "apps/web/package.json"));
const { default: react } = await import(pathToFileURL(webRequire.resolve("@vitejs/plugin-react")));
const { default: tailwind } = await import(pathToFileURL(webRequire.resolve("@tailwindcss/vite")));
export default defineConfig({
  root,
  configFile: false,
  envDir: false,
  plugins: [
    {
      name: "mail-baseline-fixture",
      resolveId(id) {
        if (id === "virtual:mail-baseline") return "\0mail-baseline.tsx";
      },
      async load(id) {
        if (id !== "\0mail-baseline.tsx") return;
        const source = execFileSync(
          "git",
          ["show", "53498fbb^:apps/web/src/features/mail/compose/mail-composer.tsx"],
          { cwd: root, encoding: "utf8" },
        ).replace(
          '"./mail-compose"',
          JSON.stringify(path.join(root, "apps/web/src/features/mail/compose/mail-compose.ts")),
        );
        return (
          await transformWithEsbuild(source, "baseline.tsx", { loader: "tsx", jsx: "automatic" })
        ).code;
      },
    },
    react(),
    tailwind(),
  ],
  resolve: { alias: { "@": path.join(root, "apps/web/src") } },
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:1499") },
  server: { host: "127.0.0.1", port: 1499, strictPort: true },
});
