// `bun scripts/registry.ts check` — the registry files are valid and say what they claim to.
//
// This runs in CI on every push, because the registry is edited by a workflow and by people, and a listing that
// fails to parse takes the whole site down with it.
import { problemsWith, type Kind, type Registry } from "../src/lib/registry";

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

process.exit(bad ? 1 : 0);
