// What runs when somebody opens a submission: read the form, check the rules, audit a template, and write one
// comment saying exactly what a maintainer would otherwise have to work out by hand.
//
//   bun scripts/validate.ts            reads the issue from the environment GitHub Actions provides
//
// It never approves anything. Its whole job is to make the decision cheap for the person who does.
import { appendFileSync } from "node:fs";
import { problemsWith, readRegistry, type Kind } from "../src/lib/registry";
import { auditTemplate, renderReport } from "./audit";
import { kindOf, parseSubmission, toEntry } from "./submission";

const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await Bun.file(process.env.GITHUB_EVENT_PATH).text()) : null;
const issue = event?.issue as { number: number; title: string; body: string; user: { login: string }; labels: { name: string }[] } | undefined;
if (!issue) { console.error("no issue in the event payload: this runs from GitHub Actions"); process.exit(2); }

const kind: Kind | null = kindOf(issue.labels.map((l) => l.name), issue.title);
if (!kind) { console.log("not a submission issue; nothing to do"); process.exit(0); }

const parsed = parseSubmission(issue.body ?? "", kind);
const registry = await readRegistry(kind);
const entry = toEntry(parsed, { submittedBy: issue.user.login, issue: issue.number });
const problems = problemsWith(entry, kind, registry.entries);

const lines: string[] = [];
lines.push(`**${kind === "template" ? "Template" : "Plugin"} submission for \`${parsed.repository ?? "(unreadable)"}\`**`, "");

if (problems.length) {
  lines.push("The form needs a change before this can be looked at:", "", ...problems.map((p) => `- ${p}`), "");
  lines.push("Edit the issue and this check runs again.");
} else if (kind === "plugin") {
  // Deliberately unaudited: there is no plugin format yet to audit against.
  lines.push("The form is complete.", "");
  lines.push(
    "Plugins are not audited yet, because `pb_plugins` does not exist and there is nothing to check a manifest or a set of permissions against. This submission is recorded so the shape of what people want is visible while that is being designed, and a maintainer will decide whether to list it.",
  );
} else {
  const { report, commit, blocking } = await auditTemplate(parsed.repository!);
  lines.push(`Audited at \`${commit?.slice(0, 12) ?? "unknown"}\`:`, "", renderReport(report), "");
  if (blocking.length) lines.push("This cannot be listed as it stands:", "", ...blocking.map((b) => `- ${b}`));
  else lines.push("Nothing blocking. A maintainer decides from here; the checks above are a first pass and not a guarantee.");
  await Bun.write("audit.json", JSON.stringify({ report, commit }, null, 2));
}

const comment = lines.join("\n");
console.log(comment);
await Bun.write("comment.md", `${comment}\n`);
// the workflow reads these to label the issue. GITHUB_OUTPUT is appended to, never written over: other steps in the
// same job write to the same file and Bun.write would truncate what they put there.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\nok=${problems.length === 0}\n`);
process.exit(0);
