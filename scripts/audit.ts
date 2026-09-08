// The audit a template goes through before anyone can list it.
//
// Two layers, and the difference between them is the point. The checks below are deterministic: they run the same
// way every time, they say what they looked at, and a person can disagree with any single one by reading it. The
// model pass on top is advisory, is labelled as advisory wherever it is shown, and cannot fail a submission on its
// own. An audit that quietly rejected people on a model's opinion would be worse than no audit.
//
// Plugins are not audited yet. pb_plugins does not exist, so there is no manifest to check and no permissions to
// compare against usage, and inventing checks for a format nobody has written would only teach submitters to game
// something we are about to change.
import type { AuditReport } from "../src/lib/registry";
import { fileAt, headCommit, repoFacts, rootPaths } from "./github";

/** things that are worth a human looking twice, not things that are proof of anything */
const SMELLS: [RegExp, string][] = [
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

/** Formats a report the way both the issue comment and the site show it. */
export function renderReport(report: AuditReport): string {
  const lines = report.checks.map((c) => `- ${c.passed ? "PASS" : "FAIL"}  **${c.name}** — ${c.detail}`);
  if (report.summary) lines.push("", `> Advisory, from a model rather than a rule: ${report.summary}`);
  return lines.join("\n");
}
