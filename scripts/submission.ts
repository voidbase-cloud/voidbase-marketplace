// Reading a submission out of a GitHub issue form.
//
// An issue form renders as markdown headings followed by values, which is the only contract we have with GitHub, so
// parsing is deliberately forgiving about spacing and strict about which headings it recognises.
import { CATEGORIES, normalizeRepository, type Entry, type Kind } from "../src/lib/registry";

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

/** the kind an issue is about, from its labels or its title, so one workflow can serve both forms */
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
