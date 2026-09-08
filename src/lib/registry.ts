// What a listing is, and the rules a submission has to pass before it becomes one.
//
// The registry is two JSON files in this repository rather than rows in a database, for the same reason the rest of
// voidbase keeps configuration in git: a listing is a claim about somebody else's code, and a claim like that should
// arrive as a reviewable diff with a name on it. The site reads these files at build time.

export type Kind = "template" | "plugin";

export interface Entry {
  /** owner/name on GitHub, lower case, which is also the listing's identity */
  repository: string;
  title: string;
  summary: string;
  /** who submitted it, for the record */
  submittedBy: string;
  /** the issue the submission arrived in */
  issue: number;
  /** ISO date the maintainer accepted it */
  listedOn: string;
  category: string;
  tags: string[];
  /** the commit the audit looked at, so a later change is visible as a change */
  commit?: string;
  /** what the audit found, if it ran */
  audit?: AuditReport;
}

export interface AuditReport {
  ranOn: string;
  /** every check that ran, so a reader can disagree with any single one */
  checks: { name: string; passed: boolean; detail: string }[];
  /** the optional model pass, which is advisory and says so */
  summary?: string;
}

export interface Registry {
  schemaVersion: number;
  entries: Entry[];
}

export const CATEGORIES: Record<Kind, string[]> = {
  template: ["Starter", "Site", "Application", "Integration", "Example"],
  plugin: ["Auth", "Content", "Media", "Operations", "Payments", "Search", "Other"],
};

export const MAX_TAGS = 3;

/** "https://github.com/Owner/Name/" and "Owner/Name" both mean the same repository, and it is stored lower case */
export function normalizeRepository(input: string): string | null {
  const cleaned = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(cleaned);
  return m ? `${m[1]!.toLowerCase()}/${m[2]!.toLowerCase()}` : null;
}

/** The reasons a submission is refused, all of them checkable without asking a person. */
export function problemsWith(entry: Partial<Entry>, kind: Kind, existing: Entry[]): string[] {
  const out: string[] = [];
  const repository = entry.repository ? normalizeRepository(entry.repository) : null;
  if (!repository) out.push("the repository has to be a GitHub repository, as a URL or as owner/name");
  else if (existing.some((e) => e.repository === repository)) out.push(`${repository} is already listed`);

  if (!entry.title?.trim()) out.push("a title is required");
  else if (entry.title.trim().length > 60) out.push("the title has to be 60 characters or fewer");

  const summary = entry.summary?.trim() ?? "";
  if (!summary) out.push("a one-line summary is required");
  else if (summary.length > 160) out.push("the summary has to be 160 characters or fewer");
  else if (summary.split("\n").length > 1) out.push("the summary has to be one line");

  if (!entry.category || !CATEGORIES[kind].includes(entry.category)) out.push(`the category has to be one of: ${CATEGORIES[kind].join(", ")}`);

  const tags = entry.tags ?? [];
  if (!tags.length) out.push("at least one tag is required");
  else if (tags.length > MAX_TAGS) out.push(`${MAX_TAGS} tags at most, and this has ${tags.length}`);

  return out;
}

export const readRegistry = async (kind: Kind): Promise<Registry> =>
  JSON.parse(await Bun.file(new URL(`../../registry/${kind}s.json`, import.meta.url)).text()) as Registry;
