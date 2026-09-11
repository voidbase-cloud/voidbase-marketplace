// What a maintainer runs on a submission: read the form, check the rules, audit a template, and write one comment
// saying exactly what they would otherwise have to work out by hand.
//
//   bun scripts/validate.ts --issue <number>            prints the audit
//   bun scripts/validate.ts --issue <number> --post     and posts it on the issue as a comment
//
// It never approves anything. Its whole job is to make the decision cheap for the person who does.
import { problemsWith, readRegistry, type Kind } from "../src/lib/registry";
import { auditTemplate, auditTheme, renderReport } from "./audit";
import { commentOnIssue, kindOf, parseSubmission, readIssue, toEntry } from "./submission";

const issue = await readIssue();

const kind: Kind | null = kindOf(issue.labels.map((l) => l.name), issue.title);
if (!kind) {
  if (/^\[remove\]/i.test(issue.title) || issue.labels.some((l) => l.name === "remove")) {
    const target = issue.title.replace(/^\[remove\]\s*/i, "").trim();
    const note = `**Removal request for \`${target || "(unnamed)"}\`**\n\nA maintainer confirms it with the \`approved\` label; the listing then leaves the marketplace, and instances that installed it keep what they have.`;
    console.log(note);
    if (process.argv.includes("--post")) { await commentOnIssue(issue.number, note); console.log(`\nposted on #${issue.number}`); }
    process.exit(0);
  }
  console.log("not a submission issue; nothing to do"); process.exit(0);
}

const parsed = parseSubmission(issue.body ?? "", kind);
const registry = await readRegistry(kind);
const entry = toEntry(parsed, { submittedBy: issue.user.login, issue: issue.number });
const problems = problemsWith(entry, kind, registry.entries);

const lines: string[] = [];
const KIND = { template: "Template", plugin: "Plugin", theme: "Theme" };
lines.push(`**${KIND[kind]} submission for \`${parsed.repository ?? "(unreadable)"}\`**`, "");

if (problems.length) {
  lines.push("The form needs a change before this can be looked at:", "", ...problems.map((p) => `- ${p}`), "");
  lines.push("Edit the issue and this check runs again.");
} else if (kind === "plugin") {
  // Deliberately unaudited: there is no plugin format yet to audit against.
  lines.push("The form is complete.", "");
  lines.push(
    "The plugin is audited when it is listed: `bun run submission:approve -- --issue <number>` builds it from the repository at its current commit, audits the source and the bundle, and records what it found with the version.",
  );
} else {
  const { report, commit, blocking } = kind === "theme" ? await auditTheme(parsed.repository!) : await auditTemplate(parsed.repository!);
  lines.push(`Audited at \`${commit?.slice(0, 12) ?? "unknown"}\`:`, "", renderReport(report), "");
  if (blocking.length) lines.push("This cannot be listed as it stands:", "", ...blocking.map((b) => `- ${b}`));
  else lines.push("Nothing blocking. A maintainer decides from here; the checks above are a first pass and not a guarantee.");
  if (kind === "theme") lines.push("", "The files themselves are audited when the theme is published: no JavaScript in the overlay, nothing outside the directories theme.json declares, one kind of file, and a size ceiling. What that finds is recorded with the version.");
  await Bun.write("audit.json", JSON.stringify({ report, commit }, null, 2));
}

const comment = lines.join("\n");
console.log(comment);
if (process.argv.includes("--post")) {
  await commentOnIssue(issue.number, comment);
  console.log(`\nposted on #${issue.number}`);
}
process.exit(0);
