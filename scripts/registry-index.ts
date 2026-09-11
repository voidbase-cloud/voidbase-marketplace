// registry/v1/index.json, generated from the listings (registry/plugins.json, registry/templates.json,
// registry/themes.json) and the version records under registry/v1: the file an instance reads first (voidbase's
// docs/registry.md).
//
// A listed plugin or theme with no version is a registration and not a release, so it is not in the index; a version
// whose repository is not listed is not served either, because the listing is the reviewed claim and the bundle or
// the files are only its artifact. `generatedOn` is the newest publication date rather than the clock, so the file is
// the same for the same inputs and `registry:check` can tell a stale index from a fresh one.
//
// Themes are a fourth key beside `plugins` and `templates`, and every listing carries a `kind`. Both are additions a
// client that has never heard of a theme ignores: voidbase's own `problemsWithIndex` validates the keys it knows and
// says nothing about the rest, and `voidbase plugins add <name>` reads `plugins` alone, so an older instance reads an
// index with themes in it exactly as it read one without.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Entry } from "../src/lib/registry";

/** the repository this index is built from: registry/ sits under it (a test builds one from a copy) */
export const ROOT = resolve(import.meta.dir, "..");
export const REGISTRY_DIR = join(ROOT, "registry/v1");
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

type Served = { version: string; publishedOn: string; source: { repository: string } };

/** the releases of one kind: every version record under registry/v1/<dir>, by the name the directory is called */
function releasesOf(root: string, dir: string, listed: Map<string, Entry>, kind: "plugin" | "theme", newest: { on: string }) {
  const base = join(root, "registry/v1", dir);
  const out: Record<string, unknown>[] = [];
  for (const name of existsSync(base) ? readdirSync(base).sort() : []) {
    const versions = readdirSync(join(base, name)).filter((f) => f.endsWith(".json")).map((f) => read(join(base, name, f)) as Served).sort((a, b) => compareVersions(a.version, b.version));
    if (!versions.length) continue;
    const latest = versions[versions.length - 1]!;
    const entry = listed.get(latest.source.repository);
    if (!entry) { console.warn(`registry/v1/${dir}/${name}: ${latest.source.repository} is not listed in registry/${kind}s.json, so it is not served`); continue; }
    for (const v of versions) if (v.publishedOn > newest.on) newest.on = v.publishedOn;
    out.push({ kind, name, repository: entry.repository, title: entry.title, summary: entry.summary, latest: latest.version, versions });
  }
  return out;
}

export function buildIndex(root: string = ROOT) {
  const entries = (kind: string) => read(join(root, `registry/${kind}s.json`)).entries as Entry[];
  const templates = entries("template");
  const newest = { on: "" };
  const plugins = releasesOf(root, "plugins", new Map(entries("plugin").map((e) => [e.repository, e])), "plugin", newest);
  const themes = releasesOf(root, "themes", new Map(entries("theme").map((e) => [e.repository, e])), "theme", newest);
  return {
    schemaVersion: 1,
    marketplace: MARKETPLACE,
    generatedOn: newest.on || "1970-01-01",
    plugins,
    templates: templates.map((t) => ({ kind: "template", repository: t.repository, title: t.title, summary: t.summary, ...(t.commit ? { commit: t.commit } : {}) })),
    themes,
  };
}

export const renderIndex = (root: string = ROOT): string => `${JSON.stringify(buildIndex(root), null, 2)}\n`;

export function writeIndex(root: string = ROOT): string {
  const path = join(root, "registry/v1/index.json");
  writeFileSync(path, renderIndex(root));
  return path;
}

if (import.meta.main) console.log(`wrote ${writeIndex()}`);
