import { defineConfig } from "vite";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

// Dedicated dev-only Vite server for the MR9 Browser Presentation Lab.
//
// The Lab is a plain-browser page (lab.html -> src/lab/) that mounts the one
// production ExpandedPresentationSurface with synthetic ExpandedPresentationTarget
// inputs. It intentionally has no Electron preload/bridge and no downloader
// runtime: start it with `npm run dev:lab` and open:
//
//   http://127.0.0.1:1421/lab.html
//
// This config never participates in the production build (vite.config.ts pins
// build input to index.html only), so no packaged Electron renderer depends on
// the Lab entry.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "lab-port-cache",
      config(config, { command }) {
        if (command !== "serve") return;
        return { cacheDir: join(process.env.LAB_TEST_CACHE_ROOT ?? "node_modules/.vite-lab", String(config.server?.port ?? 1421)) };
      },
    },
  ],
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  optimizeDeps: {
    entries: ["lab.html"],
  },
  // An explicit Lab build is available for bundle-cost inspection. It never
  // changes the production Vite input, which remains index.html only.
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL("./lab.html", import.meta.url)),
    },
  },
  server: {
    port: 1421,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // Nested checkouts and generated evidence/runtime outputs are not Lab inputs.
      ignored: [".cindy-worktrees", ".cindy-upstream", ".p2v-release-evidence", ".trellis", "desktop-assets", "build", "dist-release", "agentation-placement-package-output", "spike-package-output"]
        .map((directory) => `${fileURLToPath(new URL(`./${directory}`, import.meta.url)).replaceAll("\\", "/")}/**`),
    },
  },
}));
