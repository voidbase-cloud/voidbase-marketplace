// What a maintainer runs to approve a submission: the issue becomes an entry in the registry (and, for a plugin,
// a built, audited and hashed version under registry/v1/), committed and pushed, and the issue is answered and
// closed. The listing arrives as a commit somebody can read, revert and argue with, and the push deploys it.
//
//   bun scripts/approve.ts --issue <number>              list, bundle a plugin, commit, push, comment, close
//   bun scripts/approve.ts --issue <number> --no-push    stop after the commit, to look first
//
// The audit is re-run rather than trusted from the earlier comment, because a repository can change between the
// submission and the decision and the recorded commit has to be the one that was actually looked at.
import { CATEGORIES, problemsWith, type Entry, type Kind, type Registry } from "../src/lib/registry";
import { auditTemplate, auditTheme } from "./audit";
import { closeIssue, commentOnIssue, kindOf, must, parseSubmission, readIssue, toEntry } from "./submission";

const issue = await readIssue();

const kind: Kind | null = kindOf(issue.labels.map((l) => l.name), issue.title);
if (!kind) { console.error("this issue is not a template or plugin submission"); process.exit(1); }

const path = `registry/${kind}s.json`;
const registry = JSON.parse(await Bun.file(path).text()) as Registry;
const parsed = parseSubmission(issue.body ?? "", kind);
let entry: Entry = toEntry(parsed, { submittedBy: issue.user.login, issue: issue.number });

const problems = problemsWith(entry, kind, registry.entries);
if (problems.length) { console.error(`refusing to list ${parsed.repository}:\n${problems.map((p) => `  - ${p}`).join("\n")}`); process.exit(1); }

// a template and a theme are listed with what the audit found at a commit; a plugin's audit belongs with the version
// its pipeline builds, which is where it is recorded
if (kind !== "plugin") {
  const { report, commit, blocking } = kind === "theme" ? await auditTheme(entry.repository) : await auditTemplate(entry.repository);
  if (blocking.length) { console.error(`the audit blocks this listing:\n${blocking.map((b) => `  - ${b}`).join("\n")}`); process.exit(1); }
  entry = { ...entry, commit: commit ?? undefined, audit: report };
}

registry.entries.push(entry);
registry.entries.sort((a, b) => a.repository.localeCompare(b.repository));
await Bun.write(path, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`listed ${entry.repository} as a ${kind} in ${entry.category || CATEGORIES[kind][0]}`);

// a plugin and a theme are also served: the pipeline writes registry/v1/ and regenerates the index. A plugin is
// built from its source; a theme has nothing to build, so its files are audited, hashed and copied as they are.
if (kind === "plugin") must(["bun", "scripts/bundle.ts", entry.repository]);
if (kind === "theme") must(["bun", "scripts/theme.ts", entry.repository]);

// the deploy checks nothing, so the check happens here, before the listing can reach master
must(["bun", "scripts/registry.ts", "check"]);
must(["git", "add", "registry"]);
must(["git", "commit", "-m", `feat(registry): list ${entry.repository} from #${issue.number}`]);
if (process.argv.includes("--no-push")) { console.log("committed, not pushed (--no-push)"); process.exit(0); }
must(["git", "push", "-q", "origin", "HEAD:master"]);
await commentOnIssue(issue.number, "Listed. It appears on https://marketplace.voidbase.cloud when the deploy finishes.");
await closeIssue(issue.number);
console.log(`pushed; #${issue.number} answered and closed`);
