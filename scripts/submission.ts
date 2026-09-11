// Reading a submission out of a GitHub issue form.
//
// An issue form renders as markdown headings followed by values, which is the only contract we have with GitHub, so
// parsing is deliberately forgiving about spacing and strict about which headings it recognises. The issue itself is
// read through `gh` on a maintainer's machine (--issue <number>): the marketplace runs no GitHub Actions.
import { CATEGORIES, normalizeRepository, type Entry, type Kind } from "../src/lib/registry";

export const REPO = process.env.MARKETPLACE_REPO ?? "voidbase-cloud/voidbase-marketplace";
export interface Issue { number: number; title: string; body: string; user: { login: string }; labels: { name: string }[] }

/** the submission issue named by --issue <number>, read with gh (signed in with access to the repository) */
const GH_API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
const ghToken = () => process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
/** GitHub's REST API with GH_TOKEN (a build), else `gh` (a maintainer's machine) */
export async function ghApi(method: string, path: string, body?: unknown): Promise<unknown> {
  if (ghToken()) {
    const r = await fetch(`${GH_API}${path}`, { method, headers: { authorization: `Bearer ${ghToken()}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "voidbase-marketplace", ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); if (!r.ok) throw new Error(`GitHub ${method} ${path}: ${r.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  const args = ["gh", "api", "-X", method, path]; if (body !== undefined) args.push("--input", "-");
  const p = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe", stdin: body !== undefined ? new TextEncoder().encode(JSON.stringify(body)) : undefined });
  if (p.exitCode !== 0) throw new Error(`gh api ${path}: ${p.stderr.toString().trim()}`);
  const out = p.stdout.toString(); return out ? JSON.parse(out) : null;
}
export async function readIssue(args = process.argv.slice(2)): Promise<Issue> {
  const i = args.indexOf("--issue"); const n = Number(args[i + 1]);
  if (i < 0 || !Number.isInteger(n) || n <= 0) { console.error("say which issue: --issue <number>"); process.exit(2); }
  let j: { number: number; title: string; body: string | null; user: { login: string }; labels: { name: string }[] };
  try { j = (await ghApi("GET", `/repos/${REPO}/issues/${n}`)) as typeof j; } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); }
  return { number: j.number, title: j.title, body: j.body ?? "", user: j.user, labels: j.labels };
}
export const commentOnIssue = (n: number, body: string) => ghApi("POST", `/repos/${REPO}/issues/${n}/comments`, { body });
export const closeIssue = (n: number) => ghApi("PATCH", `/repos/${REPO}/issues/${n}`, { state: "closed", state_reason: "completed" });

/** a gh or git command that has to succeed, its output shown */
export function must(cmd: string[]): void {
  const p = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0) { console.error(`${cmd.slice(0, 3).join(" ")} failed`); process.exit(p.exitCode || 1); }
}

export interface Parsed {
  kind: Kind;
  repository: string | null;
  title: string;
  summary: string;
  category: string;
  tags: string[];
}

const NONE = /^(_no response_|n\/a|none|-)$/i;

/** the value under a "### Heading" in an issue form body */
export function field(body: string, heading: string): string {
  const re = new RegExp(`^###\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*$`, "im");
  const m = re.exec(body);
  if (!m) return "";
  const rest = body.slice(m.index + m[0].length);
  const next = /^###\s+/m.exec(rest);
  const value = (next ? rest.slice(0, next.index) : rest).trim();
  return NONE.test(value) ? "" : value;
}

export function parseSubmission(body: string, kind: Kind): Parsed {
  const tags = field(body, "Tags")
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
  return {
    kind,
    repository: normalizeRepository(field(body, "Repository")),
    title: field(body, "Title").replace(/\s+/g, " ").trim(),
    summary: field(body, "One-line summary").replace(/\s+/g, " ").trim(),
    category: field(body, "Category").trim(),
    tags,
  };
}

/** the kind an issue is about, from its labels or its title, so one command can serve both forms */
export function kindOf(labels: string[], title: string): Kind | null {
  for (const kind of ["template", "plugin", "theme"] as Kind[]) if (labels.includes(kind)) return kind;
  const m = /^\[(template|plugin|theme)\]/i.exec(title);
  return m ? (m[1]!.toLowerCase() as Kind) : null;
}

export function toEntry(parsed: Parsed, o: { submittedBy: string; issue: number; commit?: string }): Entry {
  return {
    repository: parsed.repository ?? "",
    title: parsed.title,
    summary: parsed.summary,
    submittedBy: o.submittedBy,
    issue: o.issue,
    listedOn: new Date().toISOString().slice(0, 10),
    category: CATEGORIES[parsed.kind].includes(parsed.category) ? parsed.category : "",
    tags: parsed.tags,
    ...(o.commit ? { commit: o.commit } : {}),
  };
}
