import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { voidPlugin } from "void";
import { voidReact } from "@void/react/plugin";
import { voidbaseAdapter } from "@voidbase-cloud/voidbase/adapter/plugin";

// A voidbase stack app: pages prerendered into pb_public, routes/ into the Worker, the whole thing deployed as one
// Worker. The registry is read at build time from registry/*.json, so the listing is static and the instance is
// there for what comes after listing.
/**
 * The served registry (registry/v1: the index, the version records, the bundles) goes into the client build as-is,
 * and the adapter carries the client build into pb_public, so the asset layer serves it at /registry/v1/... with no
 * Worker in the way. It is emitted rather than kept under public/, because the pages import the index too and Vite
 * refuses imports from public/.
 */
function registryFiles() {
  const root = fileURLToPath(new URL("./registry/v1", import.meta.url));
  const walk = (dir: string, out: string[] = []): string[] => { for (const e of readdirSync(dir)) { const p = join(dir, e); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
  return {
    name: "registry-files",
    apply: "build" as const,
    generateBundle(this: { environment?: { name?: string }; emitFile(f: { type: "asset"; fileName: string; source: Uint8Array }): string }) {
      if (this.environment?.name && this.environment.name !== "client") return;
      for (const f of walk(root)) this.emitFile({ type: "asset", fileName: `registry/v1/${relative(root, f).split("\\").join("/")}`, source: readFileSync(f) });
    },
  };
}

export default defineConfig({
  plugins: [voidPlugin(), voidReact(), registryFiles(), voidbaseAdapter()],
  envPrefix: "PB",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
