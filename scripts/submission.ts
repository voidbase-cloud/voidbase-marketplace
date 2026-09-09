// Reading a submission out of a GitHub issue form.
//
// An issue form renders as markdown headings followed by values, which is the only contract we have with GitHub, so
// parsing is deliberately forgiving about spacing and strict about which headings it recognises. The issue itself is
// read through `gh` on a maintainer's machine (--issue <number>): the marketplace runs no GitHub Actions.
import { CATEGORIES, normalizeRepository, type Entry, type Kind } from "../src/lib/registry";

export const REPO = process.env.MARKETPLACE_REPO ?? "voidbase-cloud/voidbase-marketplace";
export interface Issue { number: number; title: string; body: string; user: { login: string }; labels: { name: string }[] }

/** the submission issue named by --issue <number>, read with gh (signed in with access to the repository) */
export function readIssue(args = process.argv.slice(2)): Issue {
  const i = args.indexOf("--issue"); const n = Number(args[i + 1]);
  if (i < 0 || !Number.isInteger(n) || n <= 0) { console.error("say which issue: --issue <number>"); process.exit(2); }
  const p = Bun.spawnSync(["gh", "api", `repos/${REPO}/issues/${n}`], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) { console.error(`gh api repos/${REPO}/issues/${n}: ${p.stderr.toString().trim()}`); process.exit(2); }
  const j = JSON.parse(p.stdout.toString()) as { number: number; title: string; body: string | null; user: { login: string }; labels: { name: string }[] };
  return { number: j.number, title: j.title, body: j.body ?? "", user: j.user, labels: j.labels };
}

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
  if (labels.includes("template")) return "template";
  if (labels.includes("plugin")) return "plugin";
  if (/^\[template\]/i.test(title)) return "template";
  if (/^\[plugin\]/i.test(title)) return "plugin";
  return null;
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
