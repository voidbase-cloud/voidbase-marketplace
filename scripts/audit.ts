// The audit a template goes through before anyone can list it.
//
// Two layers, and the difference between them is the point. The checks below are deterministic: they run the same
// way every time, they say what they looked at, and a person can disagree with any single one by reading it. The
// model pass on top is advisory, is labelled as advisory wherever it is shown, and cannot fail a submission on its
// own. An audit that quietly rejected people on a model's opinion would be worse than no audit.
//
// A theme is audited twice, and this is the first pass: it reads the repository at a commit, so a submitter is told
// what is wrong before a maintainer spends a decision on it, and scripts/theme.ts audits the whole checkout when the
// version is published. A plugin has no first pass here at all: its manifest and its bundle are what there is to
// check, and scripts/bundle.ts has both in front of it.
import type { AuditReport } from "../src/lib/registry";
import { carriedBy, normalizeThemeManifest, problemsWithThemeManifest } from "../src/lib/theme";
import { fileAt, headCommit, repoFacts, rootPaths } from "./github";

/** things that are worth a human looking twice, not things that are proof of anything */
export const SMELLS: [RegExp, string][] = [
  [/curl[^\n|]*\|\s*(sudo\s+)?(ba)?sh/i, "pipes a download straight into a shell"],
  [/\beval\s*\(/, "calls eval"],
  [/child_process|Bun\.\$|execSync/, "runs other programs"],
  [/(AKIA|ghp_|sk-[A-Za-z0-9]{20,})/, "looks like it contains a credential"],
];

const FILES_TO_READ = ["package.json", "README.md", "void.json", "vite.config.ts", "vite.config.mts"];

export async function auditTemplate(repository: string): Promise<{ report: AuditReport; commit: string | null; blocking: string[] }> {
  const checks: AuditReport["checks"] = [];
  const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });

  const facts = await repoFacts(repository);
  add("public repository", facts.exists && !facts.private, facts.exists ? (facts.private ? "the repository is private" : "reachable without signing in") : "no such repository");
  if (!facts.exists || facts.private) return { report: { ranOn: new Date().toISOString(), checks }, commit: null, blocking: ["the repository has to exist and be public"] };

  add("not archived", !facts.archived, facts.archived ? "archived repositories stop getting fixes" : "actively owned");
  add("has a licence", !!facts.licence, facts.licence ? `${facts.licence}, from GitHub's own detection` : "GitHub cannot identify one, so nobody can tell what they may do with it. A LICENSE file GitHub does not recognise counts as none here.");

  const commit = await headCommit(repository, facts.defaultBranch);
  add("has a commit to point at", !!commit, commit ? `${commit.slice(0, 12)} on ${facts.defaultBranch}` : "could not read the default branch");
  if (!commit) return { report: { ranOn: new Date().toISOString(), checks }, commit: null, blocking: ["the default branch could not be read"] };

  const paths = await rootPaths(repository, commit);
  const looksLikeVoidbase = ["void.json", "vb_hooks", "vb_migrations", "pb_hooks", "pb_migrations", "vb_secrets", "pb_secrets"].filter((p) => paths.includes(p));
  add("looks like a voidbase project", looksLikeVoidbase.length > 0, looksLikeVoidbase.length ? `found ${looksLikeVoidbase.join(", ")}` : "none of void.json, vb_hooks, vb_migrations, pb_hooks or pb_migrations is in the root");
  add("has a README", paths.some((p) => /^readme(\.md|\.txt)?$/i.test(p)), paths.some((p) => /^readme/i.test(p)) ? "present" : "nothing to read before cloning it");

  const sources = await Promise.all(FILES_TO_READ.filter((f) => paths.includes(f)).map(async (f) => [f, await fileAt(repository, commit, f)] as const));
  const found: string[] = [];
  for (const [name, text] of sources) {
    if (!text) continue;
    for (const [pattern, why] of SMELLS) if (pattern.test(text)) found.push(`${name} ${why}`);
  }
  add("nothing obviously alarming in the files we read", found.length === 0, found.length ? found.join("; ") : `read ${sources.length ? sources.map(([n]) => n).join(", ") : "nothing, because none of the files we look at are there"}`);

  // Blocking is deliberately short. A missing licence or an odd-looking line is for a maintainer to weigh; only the
  // things that make a listing meaningless stop it here.
  const blocking: string[] = [];
  if (facts.archived) blocking.push("the repository is archived");
  if (!looksLikeVoidbase.length) blocking.push("nothing in the repository root says this is a voidbase project");

  return { report: { ranOn: new Date().toISOString(), checks }, commit, blocking };
}

/**
 * The same first pass for a theme, which is a different repository: a theme.json rather than a voidbase project, and
 * an overlay rather than code. It reads the manifest at the commit and nothing else, because the files themselves are
 * audited when the version is published (scripts/theme.ts), where the whole checkout is in front of us.
 */
export async function auditTheme(repository: string): Promise<{ report: AuditReport; commit: string | null; blocking: string[] }> {
  const checks: AuditReport["checks"] = [];
  const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });
  const ranOn = () => new Date().toISOString();

  const facts = await repoFacts(repository);
  add("public repository", facts.exists && !facts.private, facts.exists ? (facts.private ? "the repository is private" : "reachable without signing in") : "no such repository");
  if (!facts.exists || facts.private) return { report: { ranOn: ranOn(), checks }, commit: null, blocking: ["the repository has to exist and be public"] };

  add("not archived", !facts.archived, facts.archived ? "archived repositories stop getting fixes" : "actively owned");
  add("has a licence", !!facts.licence, facts.licence ? `${facts.licence}, from GitHub's own detection` : "GitHub cannot identify one, so nobody can tell what they may do with it");

  const commit = await headCommit(repository, facts.defaultBranch);
  add("has a commit to point at", !!commit, commit ? `${commit.slice(0, 12)} on ${facts.defaultBranch}` : "could not read the default branch");
  if (!commit) return { report: { ranOn: ranOn(), checks }, commit: null, blocking: ["the default branch could not be read"] };

  const paths = await rootPaths(repository, commit);
  const raw = paths.includes("theme.json") ? await fileAt(repository, commit, "theme.json") : null;
  add("has a theme.json", !!raw, raw ? "present in the repository root" : "no theme.json in the repository root");

  const blocking: string[] = [];
  if (facts.archived) blocking.push("the repository is archived");
  if (!raw) { blocking.push("a theme is a repository with a theme.json in its root"); return { report: { ranOn: ranOn(), checks }, commit, blocking }; }

  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch (e) { add("the manifest is valid", false, `theme.json is not JSON: ${e instanceof Error ? e.message : String(e)}`); }
  if (parsed) {
    const problems = problemsWithThemeManifest(parsed);
    add("the manifest is valid", !problems.length, problems.length ? problems.join("; ") : `${parsed.name} ${parsed.version}, by ${parsed.author}`);
    if (!problems.length) {
      const carries = carriedBy(normalizeThemeManifest(parsed));
      const roots = [carries.public, ...carries.styles].map((p) => p.split("/")[0]!);
      const missing = [...new Set(roots)].filter((r) => !paths.includes(r));
      add("carries what it declares", !missing.length, missing.length ? `${missing.join(", ")} is declared and is not in the repository root` : `${carries.public}/ over pb_public${carries.styles.length ? `, and ${carries.styles.join(", ")} to import` : ", and no stylesheet to import"}`);
      if (missing.length) blocking.push(`the theme declares ${missing.join(", ")}, which is not there`);
    } else blocking.push("theme.json has to say what it is before it can be listed");
  } else blocking.push("theme.json has to be JSON");

  add("has a README", paths.some((p) => /^readme(\.md|\.txt)?$/i.test(p)), paths.some((p) => /^readme/i.test(p)) ? "present" : "nothing to read before copying it");
  return { report: { ranOn: ranOn(), checks }, commit, blocking };
}

/** Formats a report the way both the issue comment and the site show it. */
export function renderReport(report: AuditReport): string {
  const lines = report.checks.map((c) => `- ${c.passed ? "PASS" : "FAIL"}  **${c.name}** — ${c.detail}`);
  if (report.summary) lines.push("", `> Advisory, from a model rather than a rule: ${report.summary}`);
  return lines.join("\n");
}
