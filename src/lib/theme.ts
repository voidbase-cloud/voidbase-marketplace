// What a theme is, and the rules its files have to pass before the marketplace serves them.
//
// A theme is a repository with a `theme.json` in its root, a `pb_public` overlay (files copied over an instance's
// static files) and the SCSS or CSS a stack app imports. There is no code in it, which is the whole point: nothing
// here is bundled, nothing is evaluated, and the audit is about what the files *are* rather than what they do.
//
// The rules live here rather than in the pipeline because the site, the submission audit and the publish step all
// have to agree on them, and a rule a reader cannot find is a rule nobody can disagree with.

/** what a theme declares about itself, in theme.json at the repository root */
export interface ThemeManifest {
  /** the served name, unique within one marketplace: registry/v1/themes/<name>/ */
  name: string;
  title: string;
  summary: string;
  version: string;
  /** the licence the author claims, as an SPDX id; GitHub's own detection is a separate check */
  licence: string;
  author: string;
  homepage?: string;
  /** what it carries: the overlay copied over pb_public, and the stylesheets a stack app imports */
  carries: { public?: string; styles?: string[] };
}

/** one file of a published theme, as the record carries it and the marketplace serves it */
export interface ThemeFile { path: string; bytes: number; integrity: string }

export const THEME_NAME = /^[a-z][a-z0-9-]*$/;
export const THEME_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
/** the overlay directory a theme carries when it does not say otherwise */
export const DEFAULT_PUBLIC = "pb_public";
/** what a theme is made of. Anything else is a different kind of thing and wants a different review. */
export const THEME_FILE = /\.(css|scss|sass|html|svg|json|md|txt|png|jpe?g|gif|webp|avif|ico|woff2?)$/i;
/** what an overlay may never contain: a theme that ships code is a plugin, and plugins are audited as plugins */
export const THEME_CODE = /\.(m?[jt]sx?|c[jt]s|wasm|map)$/i;
/** a whole theme a person can still read through, and one file of it */
export const MAX_THEME_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 512 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** a path inside the repository: relative, named, no `.`, no `..`, no drive and no leading slash */
export const isInsidePath = (p: string): boolean =>
  isString(p) && !p.startsWith("/") && !/^[a-z]:/i.test(p) && !p.split("/").some((s) => s === ".." || s === "." || s === "");

/** the overlay directory and the stylesheets a manifest declares, normalised (the overlay defaults to pb_public) */
export function carriedBy(m: ThemeManifest): { public: string; styles: string[] } {
  const c = m.carries ?? {};
  return { public: (c.public ?? DEFAULT_PUBLIC).replace(/\/+$/, ""), styles: (c.styles ?? []).filter(isString) };
}

/**
 * Everything wrong with a theme.json, said all at once. `licence` is the spelling the rest of this repository uses;
 * `license` is accepted because half the world spells it that way and refusing on that is not a check, it is a joke.
 */
export function problemsWithThemeManifest(input: unknown): string[] {
  const out: string[] = [];
  if (!isRecord(input)) return ["theme.json is not a JSON object"];
  const m = input as Record<string, unknown> & { carries?: unknown };
  if (!isString(m.name) || !THEME_NAME.test(m.name)) out.push(`name ${JSON.stringify(m.name)} is not a theme name (lowercase, digits and dashes)`);
  if (!isString(m.title)) out.push("a title is required");
  else if (m.title.trim().length > 60) out.push("the title has to be 60 characters or fewer");
  if (!isString(m.summary)) out.push("a one-line summary is required");
  else if (m.summary.trim().length > 160) out.push("the summary has to be 160 characters or fewer");
  else if (m.summary.split("\n").length > 1) out.push("the summary has to be one line");
  if (!isString(m.version) || !THEME_VERSION.test(m.version)) out.push(`version ${JSON.stringify(m.version)} is not a version (1.2.3, or 1.2.3-beta.1)`);
  if (!isString(m.licence) && !isString((m as { license?: unknown }).license)) out.push("a licence is required, as an SPDX id such as MIT");
  if (!isString(m.author)) out.push("an author is required");
  if (m.homepage !== undefined && (!isString(m.homepage) || !/^https?:\/\//i.test(m.homepage))) out.push("homepage, when present, has to be an http or https URL");
  if (m.carries !== undefined && !isRecord(m.carries)) out.push("carries has to be an object: { public, styles }");
  else {
    const c = (m.carries ?? {}) as { public?: unknown; styles?: unknown };
    if (c.public !== undefined && (!isString(c.public) || !isInsidePath(c.public))) out.push(`carries.public ${JSON.stringify(c.public)} is not a directory in the repository`);
    if (c.styles !== undefined && !Array.isArray(c.styles)) out.push("carries.styles has to be an array of paths");
    else for (const s of (c.styles ?? []) as unknown[]) if (!isString(s) || !isInsidePath(s)) out.push(`carries.styles ${JSON.stringify(s)} is not a file in the repository`);
  }
  return out;
}

/** the manifest as it is stored, with the licence spelling settled */
export function normalizeThemeManifest(input: Record<string, unknown>): ThemeManifest {
  const licence = (input.licence ?? input.license ?? "") as string;
  const c = (input.carries ?? {}) as { public?: string; styles?: string[] };
  return {
    name: String(input.name ?? ""), title: String(input.title ?? ""), summary: String(input.summary ?? ""),
    version: String(input.version ?? ""), licence: String(licence), author: String(input.author ?? ""),
    ...(input.homepage ? { homepage: String(input.homepage) } : {}),
    carries: { public: c.public ?? DEFAULT_PUBLIC, ...(c.styles?.length ? { styles: c.styles } : {}) },
  };
}

/**
 * The hash of a theme version: SHA-256 over the file list, `<integrity>  <path>` a line, in path order, the way a
 * checksum file is written. A theme is many files and no single one of them is the release, so the release's
 * integrity is the list; every file carries its own beside it, and both are checkable from what is served.
 */
export const themeManifestOfFiles = (files: ThemeFile[]): string =>
  [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.integrity}  ${f.path}`).join("\n");
