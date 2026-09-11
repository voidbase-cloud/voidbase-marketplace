// What changed between the version an instance has and the newest one this marketplace serves.
//
// `GET /registry/v1/plugins/<name>/diff?from=<version>` is the audit's other half. The audit says what was found in
// one release; this says what moved between two of them, which is the question somebody deciding whether to update
// actually has: files added, removed and changed, the capabilities the manifest now asks for that it did not ask for
// before, and each side's audit verdict.
//
// It is answered from what the marketplace already stored per release (the index carries every version record), and
// never by asking GitHub again: the point of a diff is that it compares two things that were audited, and a
// repository that changed since says nothing about what was published. A release published before the pipeline
// recorded a file list answers `"unknown"` for its files, with the reason, rather than pretending it has none.
// the audit as a version record carries it, from the protocol's own definition rather than this repository's copy:
// a route on Workers is type-checked without Bun's globals, and src/lib/registry.ts reads files with Bun
import type { AuditRecord } from "@voidbase-cloud/voidbase/registry";
import index from "../../registry/v1/index.json";

export interface ReleaseFile { path: string; bytes: number }
export interface ReleaseManifest { name?: string; version?: string; tier?: string; voidbase?: string; provides?: string[]; requires?: string[]; collections?: string[]; extends?: Record<string, { name: string }[]> }
export interface ReleaseRecord {
  version: string; manifest: ReleaseManifest; integrity: string; bundle?: string; bytes: number;
  /** the source files at the commit it was built from, recorded since 2026-09-11; older releases have none */
  files?: ReleaseFile[];
  source: { repository: string; commit: string }; publishedOn: string; audit?: AuditRecord;
}
export interface ReleaseListing { name: string; repository: string; title: string; summary: string; latest: string; versions: ReleaseRecord[] }
export interface IndexLike { marketplace: { name: string; url: string }; plugins: ReleaseListing[] }

export interface Verdict { ranOn: string; checks: number; passed: number; failed: number; failing: string[] }
export interface Side { version: string; publishedOn: string; commit: string; bytes: number; integrity: string; files: "known" | "unknown"; audit: Verdict | "unknown" }
export interface ListDiff { added: string[]; removed: string[] }
export interface FileDiff { added: ReleaseFile[]; removed: ReleaseFile[]; changed: { path: string; from: number; to: number }[]; unchanged: number }
export interface Diff {
  name: string; kind: "plugin"; marketplace: { name: string; url: string };
  from: Side; to: Side;
  /** by path and size; a change that keeps a file's size is invisible here and visible in the bundle's integrity */
  files: FileDiff | null;
  manifest: { requires: ListDiff; provides: ListDiff; collections: ListDiff; extends: ListDiff; tier: { from: string; to: string } | null; voidbase: { from: string; to: string } | null };
  bundle: { from: number; to: number; sameBytes: boolean; sameIntegrity: boolean };
  /** what this answer could not work out, and why; empty when both sides carried everything */
  unknown: string[];
}
/**
 * One status for every refusal, and the reason in the message. A missing plugin wants to be a 404, and under
 * /registry/v1 it cannot be one: a 404 there is the asset layer's word for "no such file", and a local Bun instance
 * turns any 404 outside /api into the site's own HTML (voidbase, src/node/serve.ts). A question answered with a page
 * is worse than a question answered with the wrong number, so this answers 400 and says what is wrong.
 */
export interface Refusal { status: 400; error: string }

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const extendsOf = (m: ReleaseManifest): string[] =>
  Object.entries(m.extends ?? {}).flatMap(([collection, fields]) => (Array.isArray(fields) ? fields.map((f) => `${collection}.${f?.name ?? "?"}`) : [`${collection}.?`]));
const diffList = (from: string[], to: string[]): ListDiff => ({ added: to.filter((x) => !from.includes(x)).sort(), removed: from.filter((x) => !to.includes(x)).sort() });

function verdictOf(r: ReleaseRecord): Verdict | "unknown" {
  const a = r.audit;
  if (!a || !Array.isArray(a.checks)) return "unknown";
  const failing = a.checks.filter((c) => !c.passed).map((c) => c.name);
  return { ranOn: a.ranOn, checks: a.checks.length, passed: a.checks.length - failing.length, failed: failing.length, failing };
}

const sideOf = (r: ReleaseRecord): Side => ({
  version: r.version, publishedOn: r.publishedOn, commit: r.source?.commit ?? "", bytes: r.bytes, integrity: r.integrity,
  files: Array.isArray(r.files) ? "known" : "unknown", audit: verdictOf(r),
});

/** the file list of two releases, compared by path and size, or null when either side did not record one */
export function diffFiles(from: ReleaseRecord, to: ReleaseRecord): FileDiff | null {
  if (!Array.isArray(from.files) || !Array.isArray(to.files)) return null;
  const a = new Map(from.files.map((f) => [f.path, f.bytes]));
  const b = new Map(to.files.map((f) => [f.path, f.bytes]));
  const added = [...b].filter(([p]) => !a.has(p)).map(([path, bytes]) => ({ path, bytes }));
  const removed = [...a].filter(([p]) => !b.has(p)).map(([path, bytes]) => ({ path, bytes }));
  const changed = [...a].filter(([p, n]) => b.has(p) && b.get(p) !== n).map(([path, bytes]) => ({ path, from: bytes, to: b.get(path)! }));
  const unchanged = [...a].filter(([p, n]) => b.get(p) === n).length;
  const byPath = <T extends { path: string }>(xs: T[]) => xs.sort((x, y) => x.path.localeCompare(y.path));
  return { added: byPath(added), removed: byPath(removed), changed: byPath(changed), unchanged };
}

/** the diff between two releases of one plugin in a registry index, or the reason there is none */
export function diffIn(reg: IndexLike, name: string, from: string, to?: string): Diff | Refusal {
  const listing = reg.plugins.find((p) => p.name === name);
  if (!listing) return { status: 400, error: `nothing is served under the name ${JSON.stringify(name)} here; /registry/v1/index.json lists what is` };
  if (!from) return { status: 400, error: `say which version this instance has: /registry/v1/plugins/${name}/diff?from=<version>` };
  const a = listing.versions.find((v) => v.version === from);
  if (!a) return { status: 400, error: `${name} ${from} is not a version this marketplace serves (it serves ${listing.versions.map((v) => v.version).join(", ")})` };
  const wanted = to ?? listing.latest;
  const b = listing.versions.find((v) => v.version === wanted);
  if (!b) return { status: 400, error: `${name} ${wanted} is not a version this marketplace serves (it serves ${listing.versions.map((v) => v.version).join(", ")})` };

  const files = diffFiles(a, b);
  const unknown: string[] = [];
  for (const [label, r] of [["from", a], ["to", b]] as const) {
    if (!Array.isArray(r.files)) unknown.push(`the files of ${r.version} (${label}): it was published before this marketplace recorded a file list, so what changed in it is unknown rather than nothing`);
    if (verdictOf(r) === "unknown") unknown.push(`the audit of ${r.version} (${label}): the record carries none`);
  }
  return {
    name, kind: "plugin", marketplace: reg.marketplace,
    from: sideOf(a), to: sideOf(b),
    files,
    manifest: {
      requires: diffList(listOf(a.manifest?.requires), listOf(b.manifest?.requires)),
      provides: diffList(listOf(a.manifest?.provides), listOf(b.manifest?.provides)),
      collections: diffList(listOf(a.manifest?.collections), listOf(b.manifest?.collections)),
      extends: diffList(extendsOf(a.manifest ?? {}), extendsOf(b.manifest ?? {})),
      tier: a.manifest?.tier !== b.manifest?.tier ? { from: String(a.manifest?.tier ?? ""), to: String(b.manifest?.tier ?? "") } : null,
      voidbase: a.manifest?.voidbase !== b.manifest?.voidbase ? { from: String(a.manifest?.voidbase ?? ""), to: String(b.manifest?.voidbase ?? "") } : null,
    },
    bundle: { from: a.bytes, to: b.bytes, sameBytes: a.bytes === b.bytes, sameIntegrity: a.integrity === b.integrity },
    unknown,
  };
}

/** the same, against the index this marketplace serves */
export const diffOf = (name: string, from: string, to?: string): Diff | Refusal => diffIn(index as unknown as IndexLike, name, from, to);
