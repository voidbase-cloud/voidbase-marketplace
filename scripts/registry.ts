// `bun scripts/registry.ts check` — the registry files are valid and say what they claim to.
//
// The approval command runs this before it commits, and a maintainer runs it after editing a listing by hand,
// because a listing that fails to parse takes the whole site down with it; the deploy itself checks nothing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { integrityOf, problemsWithIndex, type RegistryIndex } from "@voidbase-cloud/voidbase/registry";
import { problemsWith, type Kind, type Registry } from "../src/lib/registry";
import { REGISTRY_DIR, renderIndex } from "./registry-index";

const kinds: Kind[] = ["template", "plugin"];
let bad = 0;

for (const kind of kinds) {
  const path = `registry/${kind}s.json`;
  let registry: Registry;
  try { registry = JSON.parse(await Bun.file(path).text()) as Registry; }
  catch (err) { console.error(`FAIL  ${path} is not valid JSON: ${err instanceof Error ? err.message : err}`); bad++; continue; }

  if (!Array.isArray(registry.entries)) { console.error(`FAIL  ${path} has no entries array`); bad++; continue; }

  const seen: typeof registry.entries = [];
  for (const entry of registry.entries) {
    const problems = problemsWith(entry, kind, seen);
    if (problems.length) { console.error(`FAIL  ${path} ${entry.repository}: ${problems.join(", ")}`); bad++; }
    seen.push(entry);
  }
  console.log(`${bad ? "" : "PASS  "}${path}: ${registry.entries.length} entr${registry.entries.length === 1 ? "y" : "ies"}`);
}

// The served registry: the index is what the records say, every bundle is the bytes its record promises, and the
// whole thing is one an instance would accept, checked with voidbase's own validator rather than a copy of it.
const indexPath = join(REGISTRY_DIR, "index.json");
const fresh = renderIndex();
if ((existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "") !== fresh) { console.error("FAIL  registry/v1/index.json is stale or missing: run bun scripts/registry-index.ts"); bad++; }
const index = JSON.parse(fresh) as RegistryIndex;
const problems = problemsWithIndex(index);
if (problems.length) { console.error(`FAIL  registry/v1/index.json is not a registry an instance can read:\n  - ${problems.join("\n  - ")}`); bad++; }
for (const p of index.plugins) {
  for (const v of p.versions) {
    const file = join(REGISTRY_DIR, v.bundle);
    const bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
    if (!bytes || bytes.length !== v.bytes || (await integrityOf(bytes)) !== v.integrity) { console.error(`FAIL  ${p.name} ${v.version}: the bundle is not the bytes its record promises`); bad++; }
  }
}
console.log(`${bad ? "" : "PASS  "}registry/v1/index.json: ${index.plugins.length} plugin release(s), ${index.templates?.length ?? 0} template(s), every bundle matches its record`);

process.exit(bad ? 1 : 0);
