// The plugin pipeline: a repository at a commit becomes a version this marketplace serves.
//
//   bun scripts/bundle.ts <owner/name> [ref] [--force]   audit the source, bundle it, audit the bundle, hash it,
//                                                          write registry/v1/plugins/<name>/<version>.json and the
//                                                          bundle beside it, and regenerate registry/v1/index.json
//   bun scripts/bundle.ts --from-issue                     the same, for the plugin the submission issue names
//
// The marketplace builds and audits; it never runs the plugin. Everything it writes is what an instance verifies for
// itself: the bundle's bytes against the record's integrity, and the loaded bundle's manifest against the record's
// (voidbase, docs/registry.md). A version is immutable once written; a change is a new version.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { KNOWN } from "@voidbase-cloud/voidbase/interfaces";
import { checkManifest, type PluginManifest } from "@voidbase-cloud/voidbase/plugins";
import { normalizeRepository } from "../src/lib/registry";
import { SMELLS } from "./audit";
import { checkoutAt, repoFacts, resolveRef } from "./github";
import { REGISTRY_DIR, writeIndex } from "./registry-index";
import { kindOf, parseSubmission } from "./submission";

export interface Check { name: string; passed: boolean; detail: string }
export interface Built { name: string; version: string; integrity: string; bytes: number; commit: string; checks: Check[]; blocking: string[]; written: boolean }

/** a bundle a person can still read; anything bigger is a different kind of thing and wants a different review */
const MAX_BYTES = 1 << 20;
/** what an instance provides, so a bundle may import it; everything else has to be inside the bundle */
const PROVIDED = /^(@voidbase-cloud\/voidbase|hono)(\/|$)/;
const SOURCE = /\.(ts|tsx|js|mjs|cjs|json)$/;

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1); else out.push(p);
  }
  return out;
}

export async function bundlePlugin(repository: string, ref?: string, o: { force?: boolean; log?: (s: string) => void } = {}): Promise<Built> {
  const log = o.log ?? ((s: string) => console.log(s));
  const checks: Check[] = []; const blocking: string[] = [];
  const add = (name: string, passed: boolean, detail: string, blocks = false) => { checks.push({ name, passed, detail }); if (!passed && blocks) blocking.push(`${name}: ${detail}`); };
  let name = "", version = "", commit = "";
  const stop = (): Built => ({ name, version, integrity: "", bytes: 0, commit, checks, blocking, written: false });

  const repo = normalizeRepository(repository);
  if (!repo) throw new Error(`${repository} is not a GitHub repository (owner/name)`);
  const facts = await repoFacts(repo);
  add("public repository", facts.exists && !facts.private, facts.exists ? (facts.private ? "the repository is private" : "reachable without signing in") : "no such repository", true);
  if (!facts.exists || facts.private) return stop();
  add("not archived", !facts.archived, facts.archived ? "archived repositories stop getting fixes" : "actively owned", true);
  add("has a licence", !!facts.licence, facts.licence ? `${facts.licence}, from GitHub's own detection` : "GitHub cannot identify one");
  const want = ref ?? facts.defaultBranch;
  commit = (await resolveRef(repo, want)) ?? "";
  add("has a commit to build from", !!commit, commit ? `${commit.slice(0, 12)} (${want})` : `could not resolve ${want}`, true);
  if (blocking.length) return stop();

  const work = mkdtempSync(join(tmpdir(), "voidbase-plugin-"));
  const out = mkdtempSync(join(tmpdir(), "voidbase-bundle-"));
  try {
    await checkoutAt(repo, commit, work);
    log(`checked out ${repo}@${commit.slice(0, 12)}`);

    // the manifest: the plugin's own claim about itself, checked the way the loader checks it
    let manifest: PluginManifest | null = null;
    const manifestPath = join(work, "plugin.json");
    if (!existsSync(manifestPath)) add("has a plugin.json", false, "no plugin.json in the repository root", true);
    else {
      try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PluginManifest; add("has a plugin.json", true, "present"); }
      catch (e) { add("has a plugin.json", false, `plugin.json is not JSON: ${e instanceof Error ? e.message : String(e)}`, true); }
    }
    if (manifest) {
      name = String(manifest.name ?? ""); version = String(manifest.version ?? "");
      const problems = checkManifest(manifest);
      add("the manifest is valid", !problems.length, problems.length ? problems.join("; ") : `${manifest.name} ${manifest.version}, tier ${manifest.tier}, voidbase ${manifest.voidbase}`, true);
      const named = [...(manifest.provides ?? []), ...(manifest.requires ?? [])];
      const unknown = named.filter((i) => !(KNOWN as string[]).includes(i));
      add("names only interfaces voidbase defines", !unknown.length, unknown.length ? `unknown: ${unknown.join(", ")}` : named.length ? named.join(", ") : "none named", true);
    }

    // the entry point, the way a package names one
    let pkg: Record<string, unknown> = {};
    const pkgPath = join(work, "package.json");
    if (existsSync(pkgPath)) { try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>; } catch { add("package.json parses", false, "package.json is not JSON", true); } }
    const dot = typeof pkg.exports === "string" ? pkg.exports : (pkg.exports as Record<string, unknown> | undefined)?.["."];
    const candidate = (typeof dot === "string" && dot) || (typeof pkg.module === "string" && pkg.module) || (typeof pkg.main === "string" && pkg.main) || ["src/index.ts", "index.ts", "src/index.js", "index.js"].find((f) => existsSync(join(work, f))) || "";
    const entry = candidate && existsSync(join(work, candidate)) ? join(work, candidate) : "";
    add("has an entry point", !!entry, entry ? relative(work, entry) : 'no exports["."], module, main, or src/index.ts', true);
    if (manifest && typeof pkg.version === "string" && pkg.version !== manifest.version) add("package.json and plugin.json agree on the version", false, `package.json says ${pkg.version}, plugin.json ${manifest.version}`, true);

    // the source, read for what is worth a second look; a match is for a person to weigh, not proof
    const files = walk(work).filter((f) => SOURCE.test(f));
    const found: string[] = [];
    for (const f of files) { const text = readFileSync(f, "utf8"); for (const [re, why] of SMELLS) if (re.test(text)) found.push(`${relative(work, f)} ${why}`); }
    add("nothing obviously alarming in the source", !found.length, found.length ? found.join("; ") : `read ${files.length} file(s)`);
    add("has a README", existsSync(join(work, "README.md")), existsSync(join(work, "README.md")) ? "present" : "nothing to read before installing it");
    if (blocking.length || !manifest || !entry) return stop();

    // its dependencies, without running anything of theirs; what the instance does not provide ends up in the bundle
    if (existsSync(pkgPath)) {
      const install = Bun.spawnSync(["bun", "install", "--ignore-scripts", "--no-progress", "--no-summary"], { cwd: work, env: { ...process.env, CI: "1" } });
      add("dependencies install without running scripts", install.exitCode === 0, install.exitCode === 0 ? "bun install --ignore-scripts" : install.stderr.toString().trim().slice(-300), true);
      if (install.exitCode !== 0) return stop();
    }
    const result = await Bun.build({
      entrypoints: [entry], outdir: out, naming: "bundle.js", target: "browser", format: "esm", minify: false, sourcemap: "none",
      // what the instance provides stays an import; the bundler never even resolves it
      plugins: [{ name: "provided-by-the-instance", setup(b) { b.onResolve({ filter: PROVIDED }, (a) => ({ path: a.path, external: true })); } }],
    });
    add("bundles into one module", result.success, result.success ? `${result.outputs.length} output(s), target browser, format esm` : result.logs.map((l) => l.message).join("; ").slice(0, 400), true);
    if (!result.success) return stop();
    // Bun names each module in a comment by its path; the checkout is a temp directory, so the name is the repository
    const body = readFileSync(join(out, "bundle.js"), "utf8").split(relative(process.cwd(), work)).join(repo).split(work).join(repo);
    const text = `// ${manifest.name} ${manifest.version}: built by marketplace.voidbase.cloud from ${repo}@${commit} on ${new Date().toISOString().slice(0, 10)}. Imports only what an instance provides.\n${body}`;

    // the bundle on its own: what it reaches for is what the instance will let it have
    const imports = new Bun.Transpiler({ loader: "js" }).scanImports(text).map((i) => i.path);
    const foreign = imports.filter((p) => !PROVIDED.test(p));
    add("imports only what an instance provides", !foreign.length, foreign.length ? `also imports ${foreign.join(", ")}` : imports.length ? [...new Set(imports)].join(", ") : "imports nothing", true);
    add("exports the plugin as its default export", /export\s*\{[^}]*\bas\s+default\b[^}]*\}|export\s+default\b/.test(text), "the loader takes the default export", true);
    const smelly: string[] = [];
    for (const [re, why] of SMELLS) if (re.test(body)) smelly.push(why);
    add("nothing obviously alarming in the bundle", !smelly.length, smelly.length ? smelly.join("; ") : "read the whole bundle");
    const bytes = Buffer.byteLength(text);
    add("is small enough to read", bytes <= MAX_BYTES, `${bytes} bytes${bytes > MAX_BYTES ? `, over the ${MAX_BYTES} limit` : ""}`, true);
    add("the manifest is the source's", true, `plugin.json at ${commit.slice(0, 12)}; an instance checks the loaded bundle says the same`);
    if (blocking.length) return stop();

    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    const integrity = `sha256-${Buffer.from(digest).toString("base64")}`;
    const dir = join(REGISTRY_DIR, "plugins", name);
    const recordPath = join(dir, `${version}.json`);
    if (existsSync(recordPath) && !o.force) { add("the version is new", false, `${name} ${version} is already published; a change is a new version (--force overwrites one, for a mistake)`, true); return stop(); }
    mkdirSync(join(dir, version), { recursive: true });
    writeFileSync(join(dir, version, "bundle.js"), text);
    const record = { version, manifest, integrity, bundle: `plugins/${name}/${version}/bundle.js`, bytes, source: { repository: repo, commit }, publishedOn: new Date().toISOString().slice(0, 10), audit: { ranOn: new Date().toISOString(), checks } };
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    writeIndex();
    log(`wrote ${relative(process.cwd(), recordPath)} and its bundle (${bytes} bytes, ${integrity})`);
    return { name, version, integrity, bytes, commit, checks, blocking, written: true };
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  let repository: string | undefined; let ref: string | undefined;
  if (args.includes("--from-issue")) {
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await Bun.file(process.env.GITHUB_EVENT_PATH).text()) : null;
    const issue = event?.issue as { title: string; body: string; labels: { name: string }[] } | undefined;
    if (!issue) { console.error("no issue in the event payload: this runs from GitHub Actions"); process.exit(2); }
    if (kindOf(issue.labels.map((l) => l.name), issue.title) !== "plugin") { console.log("not a plugin submission; nothing to bundle"); process.exit(0); }
    repository = parseSubmission(issue.body ?? "", "plugin").repository ?? undefined;
  } else {
    [repository, ref] = args.filter((a) => !a.startsWith("--"));
  }
  if (!repository) { console.error("usage: bun scripts/bundle.ts <owner/name> [ref] [--force]  |  bun scripts/bundle.ts --from-issue"); process.exit(2); }
  const built = await bundlePlugin(repository, ref, { force });
  for (const c of built.checks) console.log(`${c.passed ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
  if (built.blocking.length) { console.error(`\n${repository} was not published:\n${built.blocking.map((b) => `  - ${b}`).join("\n")}`); process.exit(1); }
  console.log(`\npublished ${built.name} ${built.version} from ${repository}@${built.commit.slice(0, 12)}: ${built.bytes} bytes, ${built.integrity}`);
}
