// Retiring a listing: the entry leaves registry/<kind>s.json, a plugin's or a theme's served versions leave
// registry/v1, the index is regenerated, and the change is committed. An instance that installed a retired plugin
// keeps what it has (the bytes are in its pb_plugins, pinned in its lockfile), and a project that copied a retired
// theme keeps those files too; neither can be fetched from here again.
//
//   bun scripts/retire.ts <owner/name>                 retire the listing, commit
//   bun scripts/retire.ts --issue <number>             the same, for the repository a removal issue names
//                                                       ("[remove] owner/name", or a Repository field), then answer and close it
//   ... --no-push                                       stop after the commit
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { normalizeRepository, type Kind, type Registry } from "../src/lib/registry";
import { REGISTRY_DIR, writeIndex } from "./registry-index";
import { closeIssue, commentOnIssue, field, must, readIssue } from "./submission";

const args = process.argv.slice(2);
let repository: string | null = null; let issue: number | null = null;
if (args.includes("--issue")) {
  const i = await readIssue(args); issue = i.number;
  repository = normalizeRepository(field(i.body, "Repository") || i.title.replace(/^\[remove\]\s*/i, "").trim());
  if (!repository) { console.error(`#${i.number} names no repository: "[remove] owner/name" in the title, or a Repository field`); process.exit(2); }
} else {
  repository = normalizeRepository(args.find((a) => !a.startsWith("--")) ?? "");
  if (!repository) { console.error("usage: bun scripts/retire.ts <owner/name> | --issue <number>"); process.exit(2); }
}

let found: { kind: Kind; registry: Registry; path: string; name: string } | null = null;
for (const kind of ["plugin", "theme", "template"] as Kind[]) {
  const path = `registry/${kind}s.json`;
  const registry = JSON.parse(await Bun.file(path).text()) as Registry;
  const entry = registry.entries.find((e) => e.repository === repository);
  if (entry) { found = { kind, registry, path, name: repository.split("/")[1]!.replace(/^voidbase-(plugin|theme)-/, "") }; break; }
}
if (!found) { console.error(`${repository} is not listed`); process.exit(1); }
found.registry.entries = found.registry.entries.filter((e) => e.repository !== repository);
await Bun.write(found.path, `${JSON.stringify(found.registry, null, 2)}\n`);
let served = 0;
if (found.kind !== "template") {
  // the served name is the manifest's, which is what registry/v1/<kind>s/<name> is called; the index says which
  type Listing = { name: string; repository: string; versions: unknown[] };
  const index = JSON.parse(await Bun.file(join(REGISTRY_DIR, "index.json")).text()) as { plugins: Listing[]; themes?: Listing[] };
  const listing = (found.kind === "theme" ? index.themes ?? [] : index.plugins).find((p) => p.repository === repository);
  const name = listing?.name ?? found.name; served = listing?.versions.length ?? 0;
  const dir = join(REGISTRY_DIR, `${found.kind}s`, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  writeIndex();
}
console.log(`retired ${repository} (${found.kind}${served ? `, ${served} served version(s) removed` : ""})`);
must(["bun", "scripts/registry.ts", "check"]);
must(["git", "add", "registry"]);
must(["git", "commit", "-q", "-m", `feat(registry): retire ${repository}${issue ? ` from #${issue}` : ""}`]);
if (args.includes("--no-push")) { console.log("committed, not pushed (--no-push)"); process.exit(0); }
must(["git", "push", "-q", "origin", "HEAD:master"]);
if (issue) { await commentOnIssue(issue, `Retired. ${repository} leaves https://marketplace.voidbase.cloud when the deploy finishes; instances that installed it keep what they have.`); await closeIssue(issue); }
console.log(`pushed${issue ? `; #${issue} answered and closed` : ""}`);
