// What runs when a maintainer labels a submission `approved`: the issue becomes an entry in the registry, and that
// entry arrives as a commit somebody can read, revert and argue with.
//
//   bun scripts/approve.ts
//
// The audit is re-run rather than trusted from the earlier comment, because a repository can change between the
// submission and the decision and the recorded commit has to be the one that was actually looked at.
import { CATEGORIES, problemsWith, type Entry, type Kind, type Registry } from "../src/lib/registry";
import { auditTemplate } from "./audit";
import { kindOf, parseSubmission, toEntry } from "./submission";

const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await Bun.file(process.env.GITHUB_EVENT_PATH).text()) : null;
const issue = event?.issue as { number: number; title: string; body: string; user: { login: string }; labels: { name: string }[] } | undefined;
if (!issue) { console.error("no issue in the event payload: this runs from GitHub Actions"); process.exit(2); }

const kind: Kind | null = kindOf(issue.labels.map((l) => l.name), issue.title);
if (!kind) { console.error("this issue is not a template or plugin submission"); process.exit(1); }

const path = `registry/${kind}s.json`;
const registry = JSON.parse(await Bun.file(path).text()) as Registry;
const parsed = parseSubmission(issue.body ?? "", kind);
let entry: Entry = toEntry(parsed, { submittedBy: issue.user.login, issue: issue.number });

const problems = problemsWith(entry, kind, registry.entries);
if (problems.length) { console.error(`refusing to list ${parsed.repository}:\n${problems.map((p) => `  - ${p}`).join("\n")}`); process.exit(1); }

if (kind === "template") {
  const { report, commit, blocking } = await auditTemplate(entry.repository);
  if (blocking.length) { console.error(`the audit blocks this listing:\n${blocking.map((b) => `  - ${b}`).join("\n")}`); process.exit(1); }
  entry = { ...entry, commit: commit ?? undefined, audit: report };
}

registry.entries.push(entry);
registry.entries.sort((a, b) => a.repository.localeCompare(b.repository));
await Bun.write(path, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`listed ${entry.repository} as a ${kind} in ${entry.category || CATEGORIES[kind][0]}`);
