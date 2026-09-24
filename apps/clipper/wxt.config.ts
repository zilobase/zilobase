import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  outDir: ".output",
  imports: false,
  // Keep WXT's HMR server off the Node API (3000), health (3001), and Worker API (3010).
  dev: {
    server: {
      port: 3400,
      strictPort: true,
    },
  },
  manifest: {
    name: "Zilobase Web Clipper",
    description: "Save web pages to Zilobase",
    permissions: ["activeTab", "contextMenus", "storage", "scripting"],
    host_permissions: ["<all_urls>"],
    commands: {
      "open-clipper": {
        description: "Open clipper",
        suggested_key: {
          default: "Ctrl+Shift+S",
          mac: "Command+Shift+S",
        },
      },
      "quick-clip": {
        description: "Quick clip to last destination",
        suggested_key: {
          default: "Alt+Shift+S",
          mac: "Alt+Shift+S",
        },
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@/shared": path.resolve(__dirname, "../web/src/shared"),
      },
    },
  }),
});
