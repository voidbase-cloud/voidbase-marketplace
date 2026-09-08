import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { voidPlugin } from "void";
import { voidReact } from "@void/react/plugin";
import { voidbaseAdapter } from "@voidbase-cloud/voidbase/adapter/plugin";

// A voidbase stack app: pages prerendered into pb_public, routes/ into the Worker, the whole thing deployed as one
// Worker. The registry is read at build time from registry/*.json, so the listing is static and the instance is
// there for what comes after listing.
export default defineConfig({
  plugins: [voidPlugin(), voidReact(), voidbaseAdapter()],
  envPrefix: "PB",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
