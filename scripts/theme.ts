// The theme pipeline: a repository at a commit becomes a version this marketplace serves.
//
//   bun scripts/theme.ts <owner/name> [ref] [--force]   audit the files, hash each one, write
//                                                         registry/v1/themes/<name>/<version>.json and the files
//                                                         beside it, and regenerate registry/v1/index.json
//   bun scripts/theme.ts --issue <number>                the same, for the theme the submission issue names
//
// A theme has no code to bundle, so this is not the plugin pipeline with the build taken out: there is nothing to
// install its dependencies for, nothing to bundle and nothing an instance evaluates. What is left is what the files
// *are*: no JavaScript in an overlay that is copied over an instance's static files, nothing outside the directories
// the manifest declares, one kind of file, and a ceiling. Each file is hashed and served at its own path, and the
// version's own integrity is the hash of that list, because no single file is the release.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { integrityOf } from "@voidbase-cloud/voidbase/registry";
import { normalizeRepository } from "../src/lib/registry";
import { carriedBy, MAX_FILE_BYTES, MAX_THEME_BYTES, normalizeThemeManifest, problemsWithThemeManifest, THEME_CODE, THEME_FILE, themeManifestOfFiles, type ThemeFile, type ThemeManifest } from "../src/lib/theme";
import { SMELLS } from "./audit";
import type { Check } from "./bundle";
import { checkoutAt, repoFacts, resolveRef } from "./github";
import { ROOT, writeIndex } from "./registry-index";
import { kindOf, parseSubmission, readIssue } from "./submission";

export interface Published { name: string; version: string; integrity: string; bytes: number; files: ThemeFile[]; commit: string; checks: Check[]; blocking: string[]; written: boolean }

/** what an overlay may not do once a browser has it, whatever the file is called */
const SCRIPTED: [RegExp, string][] = [[/<script[\s>]/i, "has a <script> tag"], [/\bjavascript:/i, "has a javascript: URL"], [/\son[a-z]+\s*=\s*["']/i, "has an inline event handler"]];
const READABLE = /\.(css|scss|sass|html|svg|json|md|txt)$/i;

/** every file under a declared path, in path order; a symlink, a socket or a deep nest is refused rather than followed */
function collect(work: string, rel: string, out: { path: string; bytes: number }[], refused: string[], depth = 0): void {
  const abs = join(work, rel);
  if (!existsSync(abs)) { refused.push(`${rel} is declared and is not in the repository`); return; }
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) { refused.push(`${rel} is a symbolic link, which could point anywhere`); return; }
  if (st.isDirectory()) {
    if (depth > 8) { refused.push(`${rel} is nested deeper than this reads`); return; }
    for (const e of readdirSync(abs).sort()) { if (e.startsWith(".") || e === "node_modules") continue; collect(work, `${rel}/${e}`, out, refused, depth + 1); }
    return;
  }
  if (!st.isFile()) { refused.push(`${rel} is not a file`); return; }
  if (!out.some((f) => f.path === rel)) out.push({ path: rel, bytes: st.size });
}

export async function publishTheme(repository: string, ref?: string, o: { force?: boolean; root?: string; log?: (s: string) => void } = {}): Promise<Published> {
  const root = o.root ?? ROOT;
  const log = o.log ?? ((s: string) => console.log(s));
  const checks: Check[] = []; const blocking: string[] = [];
  const add = (name: string, passed: boolean, detail: string, blocks = false) => { checks.push({ name, passed, detail }); if (!passed && blocks) blocking.push(`${name}: ${detail}`); };
  let name = "", version = "", commit = "";
  const stop = (): Published => ({ name, version, integrity: "", bytes: 0, files: [], commit, checks, blocking, written: false });

  const repo = normalizeRepository(repository);
  if (!repo) throw new Error(`${repository} is not a GitHub repository (owner/name)`);
  const facts = await repoFacts(repo);
  add("public repository", facts.exists && !facts.private, facts.exists ? (facts.private ? "the repository is private" : "reachable without signing in") : "no such repository", true);
  if (!facts.exists || facts.private) return stop();
  add("not archived", !facts.archived, facts.archived ? "archived repositories stop getting fixes" : "actively owned", true);
  add("has a licence", !!facts.licence, facts.licence ? `${facts.licence}, from GitHub's own detection` : "GitHub cannot identify one");
  const want = ref ?? facts.defaultBranch;
  commit = (await resolveRef(repo, want)) ?? "";
  add("has a commit to publish from", !!commit, commit ? `${commit.slice(0, 12)} (${want})` : `could not resolve ${want}`, true);
  if (blocking.length) return stop();

  const work = mkdtempSync(join(tmpdir(), "voidbase-theme-"));
  try {
    await checkoutAt(repo, commit, work);
    log(`checked out ${repo}@${commit.slice(0, 12)}`);

    // the manifest: the theme's own claim about itself
    let manifest: ThemeManifest | null = null;
    const manifestPath = join(work, "theme.json");
    if (!existsSync(manifestPath)) add("has a theme.json", false, "no theme.json in the repository root", true);
    else {
      let raw: Record<string, unknown> | null = null;
      try { raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>; add("has a theme.json", true, "present"); }
      catch (e) { add("has a theme.json", false, `theme.json is not JSON: ${e instanceof Error ? e.message : String(e)}`, true); }
      if (raw) {
        const problems = problemsWithThemeManifest(raw);
        add("the manifest is valid", !problems.length, problems.length ? problems.join("; ") : `${raw.name} ${raw.version}, by ${raw.author}`, true);
        if (!problems.length) { manifest = normalizeThemeManifest(raw); name = manifest.name; version = manifest.version; }
      }
    }
    if (!manifest) return stop();

    // what it carries, and nothing else: the overlay, the stylesheets, and no path that leaves the checkout
    const carries = carriedBy(manifest);
    const declared = [carries.public, ...carries.styles];
    const found: { path: string; bytes: number }[] = []; const refused: string[] = [];
    for (const d of declared) collect(work, d, found, refused);
    add("carries what it declares, and only that", !refused.length && found.length > 0, refused.length ? refused.join("; ") : found.length ? `${found.length} file(s) under ${declared.join(", ")}` : `nothing under ${declared.join(", ")}`, true);
    if (refused.length || !found.length) return stop();

    const code = found.filter((f) => THEME_CODE.test(f.path));
    const scripted: string[] = [];
    for (const f of found) {
      if (!/\.(html|svg)$/i.test(f.path)) continue;
      const text = readFileSync(join(work, f.path), "utf8");
      for (const [re, why] of SCRIPTED) if (re.test(text)) scripted.push(`${f.path} ${why}`);
    }
    add("no JavaScript in what it carries", !code.length && !scripted.length, [...code.map((f) => `${f.path} is code`), ...scripted].join("; ") || "an overlay is copied over an instance's static files, so it is stylesheets and assets or it is a plugin", true);
    const strange = found.filter((f) => !THEME_FILE.test(f.path) && !THEME_CODE.test(f.path));
    add("only the kinds of file a theme is made of", !strange.length, strange.length ? `not a stylesheet, a page or an asset: ${strange.map((f) => f.path).join(", ")}` : "stylesheets, pages, images and fonts", true);

    const bytes = found.reduce((n, f) => n + f.bytes, 0);
    const fat = found.filter((f) => f.bytes > MAX_FILE_BYTES);
    add("is small enough to serve from a repository", bytes <= MAX_THEME_BYTES && !fat.length, fat.length ? `${fat.map((f) => `${f.path} is ${f.bytes} bytes, over the ${MAX_FILE_BYTES} a file may be`).join("; ")}` : `${bytes} bytes in ${found.length} file(s)${bytes > MAX_THEME_BYTES ? `, over the ${MAX_THEME_BYTES} limit` : ""}`, true);

    const smelly: string[] = [];
    for (const f of found) { if (!READABLE.test(f.path)) continue; const text = readFileSync(join(work, f.path), "utf8"); for (const [re, why] of SMELLS) if (re.test(text)) smelly.push(`${f.path} ${why}`); }
    add("nothing obviously alarming in the files it carries", !smelly.length, smelly.length ? smelly.join("; ") : `read ${found.filter((f) => READABLE.test(f.path)).length} readable file(s)`);
    add("has a README", existsSync(join(work, "README.md")), existsSync(join(work, "README.md")) ? "present" : "nothing to read before copying it");
    if (blocking.length) return stop();

    const dir = join(root, "registry/v1/themes", name);
    const recordPath = join(dir, `${version}.json`);
    if (existsSync(recordPath) && !o.force) { add("the version is new", false, `${name} ${version} is already published; a change is a new version (--force overwrites one, for a mistake)`, true); return stop(); }
    if (existsSync(join(dir, version))) rmSync(join(dir, version), { recursive: true, force: true });
    const files: ThemeFile[] = [];
    for (const f of found.sort((a, b) => a.path.localeCompare(b.path))) {
      const body = new Uint8Array(readFileSync(join(work, f.path)));
      const dest = join(dir, version, f.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      files.push({ path: f.path, bytes: body.length, integrity: await integrityOf(body) });
    }
    add("every file is hashed where it is served", true, `${files.length} file(s) under themes/${name}/${version}/`);
    const integrity = await integrityOf(new TextEncoder().encode(themeManifestOfFiles(files)));
    const record = {
      version, manifest, integrity, bytes, files, base: `themes/${name}/${version}`,
      source: { repository: repo, commit }, publishedOn: new Date().toISOString().slice(0, 10),
      audit: { ranOn: new Date().toISOString(), checks },
    };
    mkdirSync(dir, { recursive: true });
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    writeIndex(root);
    log(`wrote ${relative(root, recordPath)} and ${files.length} file(s) (${bytes} bytes, ${integrity})`);
    return { name, version, integrity, bytes, files, commit, checks, blocking, written: true };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  let repository: string | undefined; let ref: string | undefined;
  if (args.includes("--issue")) {
    const issue = await readIssue(args);
    if (kindOf(issue.labels.map((l) => l.name), issue.title) !== "theme") { console.log("not a theme submission; nothing to publish"); process.exit(0); }
    repository = parseSubmission(issue.body, "theme").repository ?? undefined;
  } else {
    [repository, ref] = args.filter((a) => !a.startsWith("--"));
  }
  if (!repository) { console.error("usage: bun scripts/theme.ts <owner/name> [ref] [--force]  |  bun scripts/theme.ts --issue <number>"); process.exit(2); }
  const built = await publishTheme(repository, ref, { force });
  for (const c of built.checks) console.log(`${c.passed ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
  if (built.blocking.length) { console.error(`\n${repository} was not published:\n${built.blocking.map((b) => `  - ${b}`).join("\n")}`); process.exit(1); }
  console.log(`\npublished ${built.name} ${built.version} from ${repository}@${built.commit.slice(0, 12)}: ${built.files.length} file(s), ${built.bytes} bytes, ${built.integrity}`);
}
