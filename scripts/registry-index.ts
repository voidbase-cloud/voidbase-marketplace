// registry/v1/index.json, generated from the listings (registry/plugins.json, registry/templates.json) and the
// version records under registry/v1/plugins: the file an instance reads first (voidbase's docs/registry.md).
//
// A listed plugin with no version is a registration and not a release, so it is not in the index; a version whose
// repository is not listed is not served either, because the listing is the reviewed claim and the bundle is only
// its artifact. `generatedOn` is the newest publication date rather than the clock, so the file is the same for the
// same inputs and `registry:check` can tell a stale index from a fresh one.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Entry } from "../src/lib/registry";

export const REGISTRY_DIR = resolve(import.meta.dir, "../registry/v1");
export const MARKETPLACE = { name: "voidbase marketplace", url: "https://marketplace.voidbase.cloud" };

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** 0.1.0 < 0.1.0-beta? No: a prerelease sorts before its release, and numbers compare as numbers */
export function compareVersions(a: string, b: string): number {
  const [ac, ap = ""] = a.split("-", 2) as [string, string?]; const [bc, bp = ""] = b.split("-", 2) as [string, string?];
  const an = ac.split(".").map(Number), bn = bc.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((an[i] ?? 0) !== (bn[i] ?? 0)) return (an[i] ?? 0) - (bn[i] ?? 0);
  if (!ap && !bp) return 0; if (!ap) return 1; if (!bp) return -1;
  const x = ap.split("."), y = bp.split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const s = x[i] ?? "", t = y[i] ?? ""; if (s === t) continue;
    const ns = Number(s), nt = Number(t);
    if (!Number.isNaN(ns) && !Number.isNaN(nt)) return ns - nt;
    return s < t ? -1 : 1;
  }
  return 0;
}

export function buildIndex() {
  const plugins = read(resolve(import.meta.dir, "../registry/plugins.json")).entries as Entry[];
  const templates = read(resolve(import.meta.dir, "../registry/templates.json")).entries as Entry[];
  const listed = new Map(plugins.map((e) => [e.repository, e]));
  const served: Record<string, unknown>[] = [];
  let newest = "";
  const dir = join(REGISTRY_DIR, "plugins");
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const versions = readdirSync(join(dir, name)).filter((f) => f.endsWith(".json")).map((f) => read(join(dir, name, f)) as { version: string; publishedOn: string; source: { repository: string } }).sort((a, b) => compareVersions(a.version, b.version));
    if (!versions.length) continue;
    const latest = versions[versions.length - 1]!;
    const entry = listed.get(latest.source.repository);
    if (!entry) { console.warn(`registry/v1/plugins/${name}: ${latest.source.repository} is not listed in registry/plugins.json, so it is not served`); continue; }
    for (const v of versions) if (v.publishedOn > newest) newest = v.publishedOn;
    served.push({ name, repository: entry.repository, title: entry.title, summary: entry.summary, latest: latest.version, versions });
  }
  return {
    schemaVersion: 1,
    marketplace: MARKETPLACE,
    generatedOn: newest || "1970-01-01",
    plugins: served,
    templates: templates.map((t) => ({ repository: t.repository, title: t.title, summary: t.summary, ...(t.commit ? { commit: t.commit } : {}) })),
  };
}

export const renderIndex = (): string => `${JSON.stringify(buildIndex(), null, 2)}\n`;

export function writeIndex(): string {
  const path = join(REGISTRY_DIR, "index.json");
  writeFileSync(path, renderIndex());
  return path;
}

if (import.meta.main) console.log(`wrote ${writeIndex()}`);
