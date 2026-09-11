// The publish pipeline on the Bun runtime, against mocks: voidbase's test/cf-mock.ts for the Builds API, a GitHub
// of this test's own for tags, and this marketplace's own index. Boots the built app (`bun run build` first).
//   bun test/publish.ts
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Diff, ReleaseRecord } from "../src/lib/diff";
import type { RegistryIndex } from "@voidbase-cloud/voidbase/registry";
const VOIDBASE = resolve(import.meta.dir, "../node_modules/@voidbase-cloud/voidbase");
// voidbase's Cloudflare mock: in the installed package when it ships one, else in a checkout of voidbase beside this
// repository, which is a parent or two up from here when this is a git worktree rather than the checkout itself
const MOCKS = ((): string => {
  const tries = [`${VOIDBASE}/test`];
  for (let d = resolve(import.meta.dir, ".."), i = 0; i < 6; i++, d = resolve(d, "..")) tries.push(resolve(d, "../voidbase/test"));
  return tries.find((d) => existsSync(`${d}/cf-mock.ts`)) ?? `${VOIDBASE}/test`;
})();
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() }); const p = s.port; s.stop(true); return p; };
const CF_PORT = freePort(), MP_PORT = freePort();
const CF = `http://127.0.0.1:${CF_PORT}`, MP = `http://127.0.0.1:${MP_PORT}`;
let pass = 0, fail = 0; const check = (l: string, ok: boolean, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  " + d}`); };
const waitFor = async (url: string) => { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up */ } await Bun.sleep(150); } throw new Error(`${url} did not come up`); };

// a GitHub with one plugin repository that has a tag this marketplace does not serve, and the index that says so
const tags: Record<string, string[]> = { "example/voidbase-plugin-echo": ["v0.2.0", "v0.1.0"] };
const index = { schemaVersion: 1, marketplace: { name: "test", url: MP }, generatedOn: "2026-09-10", plugins: [{ name: "echo", repository: "example/voidbase-plugin-echo", title: "Echo", summary: "x", latest: "0.1.0", versions: [{ version: "0.1.0", manifest: { name: "echo", version: "0.1.0", tier: "community", voidbase: "*" }, integrity: "sha256-x", bundle: "plugins/echo/0.1.0/bundle.js", bytes: 1, source: { repository: "example/voidbase-plugin-echo", commit: "0".repeat(40) }, publishedOn: "2026-09-09" }] }], templates: [] };

// ...and four theme repositories on disk, which that GitHub also serves as trees, files and tarballs, because the
// theme pipeline reads a whole checkout rather than a handful of files
const repos = mkdtempSync(join(tmpdir(), "mp-repos-"));
const write = (repo: string, path: string, body: string) => { mkdirSync(dirname(join(repos, repo, path)), { recursive: true }); writeFileSync(join(repos, repo, path), body); };
const manifest = (o: Record<string, unknown>) => JSON.stringify({ title: "Midnight", summary: "A dark theme for the panel and for a stack app's pages.", version: "1.0.0", licence: "MIT", author: "example", homepage: "https://example.com/midnight", carries: { public: "pb_public", styles: ["styles/midnight.scss"] }, ...o }, null, 2);
const HTML = '<!doctype html>\n<html lang="en"><head><link rel="stylesheet" href="/theme.css"></head><body><h1>Midnight</h1></body></html>\n';
for (const [name, extra] of [["midnight", {}], ["loud", { name: "loud" }], ["absent", { name: "absent", carries: { public: "pb_public", styles: ["styles/missing.scss"] } }]] as [string, Record<string, unknown>][]) {
  const repo = `voidbase-theme-${name}`;
  write(repo, "theme.json", manifest({ name, ...extra }));
  write(repo, "README.md", `# ${name}\n`);
  write(repo, "pb_public/index.html", name === "loud" ? HTML.replace("<h1>", '<script src="/app.js"></script><h1>') : HTML);
  write(repo, "pb_public/theme.css", ":root { --bg: #0b0b0d; }\n");
  write(repo, "pb_public/img/dot.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="4" fill="#0b0b0d"/></svg>\n');
  if (name !== "absent") write(repo, "styles/midnight.scss", "$bg: #0b0b0d;\n:root { --bg: #{$bg}; }\n");
  if (name === "loud") write(repo, "pb_public/app.js", "document.title = 'loud';\n");
}
write("voidbase-theme-bare", "README.md", "# bare\n");
const SHA = (repo: string) => Bun.hash(repo).toString(16).padStart(40, "0").slice(0, 40);
const tarball = (repo: string) => { const f = join(repos, `${repo}.tgz`); if (!existsSync(f)) Bun.spawnSync(["tar", "-czf", f, "-C", repos, repo]); return f; };
const nameOf = (repository: string) => repository.split("/")[1]!;
const isRepo = (repository: string) => existsSync(join(repos, nameOf(repository)));

const gh = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => {
  const url = new URL(req.url); const p = url.pathname;
  const m = /^\/repos\/([^/]+\/[^/]+)(?:\/(tags|commits\/[^/]+|git\/trees\/[^/]+|contents\/(.+)|tarball\/[^/]+))?$/.exec(p);
  const miss = Response.json({ message: "Not Found" }, { status: 404 });
  if (!m) return miss;
  const repository = m[1]!, rest = m[2] ?? "", dir = join(repos, nameOf(repository));
  if (rest === "tags") return Response.json((tags[repository] ?? []).map((name) => ({ name })));
  if (!isRepo(repository)) return miss;
  if (!rest) return Response.json({ private: false, archived: false, fork: false, description: null, is_template: false, pushed_at: null, default_branch: "master", stargazers_count: 0, license: { spdx_id: "MIT" } });
  if (rest.startsWith("commits/")) return Response.json({ sha: SHA(nameOf(repository)) });
  if (rest.startsWith("git/trees/")) return Response.json({ tree: readdirSync(dir, { withFileTypes: true }).map((e) => ({ path: e.name, type: e.isDirectory() ? "tree" : "blob" })) });
  if (rest.startsWith("contents/")) { const f = join(dir, m[3]!); return existsSync(f) ? Response.json({ content: Buffer.from(readFileSync(f)).toString("base64"), encoding: "base64" }) : miss; }
  if (rest.startsWith("tarball/")) return new Response(Bun.file(tarball(nameOf(repository))));
  return miss;
} });
const GH = `http://127.0.0.1:${gh.port}`;
// scripts/github.ts reads GITHUB_API_URL when it is imported, so the theme pipeline is imported after this is set
process.env.GITHUB_API_URL = GH;
const { auditTheme } = await import("../scripts/audit");
const { publishTheme } = await import("../scripts/theme");
const { buildIndex } = await import("../scripts/registry-index");
const { diffIn } = await import("../src/lib/diff");
const { integrityOf, pick, problemsWithIndex } = await import("@voidbase-cloud/voidbase/registry");
const own = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => (new URL(req.url).pathname === "/registry/v1/index.json" ? Response.json(index) : new Response("no", { status: 404 })) });

const data = mkdtempSync(join(tmpdir(), "mp-publish-")); mkdirSync(`${data}/pb_data`, { recursive: true });
const procs: ReturnType<typeof Bun.spawn>[] = [Bun.spawn(["bun", `${MOCKS}/cf-mock.ts`, String(CF_PORT)], { stdout: "ignore", stderr: "inherit" })];
await waitFor(`${CF}/__calls`);
// the Worker and its `(publish)` trigger on the mock, the way scripts/cf-builds.ts and the dashboard make them
const H = { authorization: "Bearer cf-test-user-token" }; const A = `${CF}/accounts/acc123`;
{ const form = new FormData(); form.set("metadata", new Blob([JSON.stringify({ main_module: "index.js" })], { type: "application/json" })); form.set("index.js", new File(["export default {}"], "index.js", { type: "application/javascript+module" })); await fetch(`${A}/workers/scripts/voidbase-marketplace`, { method: "PUT", headers: H, body: form }); }
const tag = ((await (await fetch(`${A}/workers/scripts`, { headers: H })).json()) as { result: { id: string; tag: string }[] }).result.find((s) => s.id === "voidbase-marketplace")!.tag;
const conn = ((await (await fetch(`${A}/builds/repos/connections`, { method: "PUT", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ provider_type: "github", provider_account_id: "1", provider_account_name: "voidbase-cloud", repo_id: "2", repo_name: "voidbase-marketplace" }) })).json()) as { result: { repo_connection_uuid: string } }).result.repo_connection_uuid;
await fetch(`${A}/builds/triggers`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ external_script_id: tag, repo_connection_uuid: conn, build_token_uuid: "bt-1", trigger_name: "voidbase-marketplace (publish)", build_command: "bun scripts/publish-build.ts", deploy_command: "true", branch_includes: ["*"], branch_excludes: ["master"], root_directory: "/", path_includes: ["*"], path_excludes: ["*"], build_caching_enabled: false }) });

const env = { ...process.env, VOIDBASE_SUPERUSER_EMAIL: "root@example.com", VOIDBASE_SUPERUSER_PASSWORD: "root-password-1", VOIDBASE_LOG_MIN_LEVEL: "8",
  VOIDBASE_HOOKS_DIR: resolve(import.meta.dir, "../.voidbase/pb_hooks"), VOIDBASE_MIGRATIONS_DIR: resolve(import.meta.dir, "../.voidbase/pb_migrations"),
  CLOUDFLARE_API_BASE: CF, VOIDBASE_WORKER_NAME: "voidbase-marketplace", VOIDBASE_ACCOUNT_ID: "acc123", MP_BUILDS_TOKEN: "cf-test-user-token", MP_WEBHOOK_SECRET: "whsec-test",
  MP_URL: `http://127.0.0.1:${own.port}`, GITHUB_API_URL: GH, MARKETPLACE_SUBMISSIONS: "true", MARKETPLACE_AUTO_VERSIONS: "true", MP_PUBLISH_TRIGGER: "voidbase-marketplace (publish)" };
const server = Bun.spawn(["bun", resolve(import.meta.dir, "../.voidbase/main.ts"), "--http", `127.0.0.1:${MP_PORT}`, "--dir", `${data}/pb_data`], { cwd: resolve(import.meta.dir, "../.voidbase"), env, stdout: "pipe", stderr: "pipe" });
procs.push(server);
const log: string[] = []; for (const stream of [server.stdout, server.stderr]) (async () => { const r = (stream as ReadableStream<Uint8Array>).getReader(); const dec = new TextDecoder(); for (;;) { const { value, done } = await r.read(); if (done) break; log.push(dec.decode(value)); } })();
const api = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => { const r = await fetch(`${MP}${path}`, { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: token } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }); let json: any = null; try { json = await r.json(); } catch { /* no body */ } return { status: r.status, json }; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const cfState = async () => (await fetch(`${CF}/__state`).then((r) => r.json())) as { builds: { build_uuid: string; trigger_uuid?: string }[] };
const sign = async (body: string) => { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec-test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const hook = async (event: string, payload: unknown, badSig = false) => { const body = JSON.stringify(payload); return api("POST", "/api/marketplace/github/webhook", body, undefined, { "x-github-event": event, "x-hub-signature-256": badSig ? "sha256=" + "0".repeat(64) : await sign(body) }); };

try {
  await waitFor(`${MP}/api/health`);
  const SU = (await api("POST", "/api/collections/_superusers/auth-with-password", { identity: "root@example.com", password: "root-password-1" })).json.token as string;
  check("the built app is up and the superuser signs in", !!SU);
  check("the webhook refuses a bad signature and answers a ping", (await hook("ping", { zen: "x" }, true)).status === 401 && (await hook("ping", { zen: "x" })).json?.pong === true);
  const issue = { number: 7, title: "[plugin] Echo", labels: [{ name: "plugin" }], user: { login: "someone" } };
  const opened = await hook("issues", { action: "opened", issue });
  const builds1 = (await cfState()).builds.length;
  check("a submission opened is queued for validation and the publish build is started through the Builds API", opened.status === 200 && opened.json.queued?.kind === "validate" && opened.json.queued.issue === 7 && opened.json.started === "started" && builds1 === 1, JSON.stringify(opened.json).slice(0, 300));
  const edited = await hook("issues", { action: "edited", issue });
  check("the same submission edited while its validation is queued is not queued twice", edited.json?.duplicate === true && (await cfState()).builds.length === 1, JSON.stringify(edited.json).slice(0, 200));
  const approved = await hook("issues", { action: "labeled", label: { name: "approved" }, issue: { ...issue, labels: [...issue.labels, { name: "approved" }] } });
  check("the approved label queues the publish (a second row); the build already pending is reused, not started again", approved.status === 200 && approved.json.queued?.kind === "publish" && approved.json.duplicate === false && approved.json.started === "started" && (await cfState()).builds.length === 1, JSON.stringify(approved.json).slice(0, 300));
  const removal = { number: 9, title: "[remove] example/voidbase-plugin-echo", labels: [] as { name: string }[], user: { login: "someone" } };
  const rmOpened = await hook("issues", { action: "opened", issue: removal });
  const rmApproved = await hook("issues", { action: "labeled", label: { name: "approved" }, issue: { ...removal, labels: [{ name: "approved" }] } });
  check("a removal issue is validated when opened and queued to retire when a maintainer approves it", rmOpened.json?.queued?.kind === "validate" && rmOpened.json.queued.issue === 9 && rmApproved.json?.queued?.kind === "retire" && rmApproved.json.queued.issue === 9, JSON.stringify([rmOpened.json, rmApproved.json]).slice(0, 300));
  check("a stranger's event with the right signature but no submission label is ignored", (await hook("issues", { action: "opened", issue: { number: 8, title: "bug: it broke", labels: [], user: { login: "x" } } })).json?.ignored === "not a submission");
  check("the queue is for superusers", (await api("GET", "/api/marketplace/publish/next")).status === 401 && (await api("GET", "/api/marketplace/publish")).status === 401);
  const first = await api("GET", "/api/marketplace/publish/next", undefined, SU);
  check("the publish build claims the oldest queued row: the validation, now building", first.status === 200 && first.json.kind === "validate" && first.json.issue === 7 && first.json.status === "building", JSON.stringify(first.json).slice(0, 200));
  const done = await api("POST", `/api/marketplace/publish/${first.json.id}/done`, { commit: "abc" }, SU);
  const second = await api("GET", "/api/marketplace/publish/next", undefined, SU);
  check("done records it; the next claim is the publish of the approved issue", done.json?.publish?.status === "done" && second.json?.kind === "publish" && second.json.issue === 7, JSON.stringify([done.json, second.json]).slice(0, 300));
  const failed = await api("POST", `/api/marketplace/publish/${second.json.id}/failed`, { error: "the audit blocks this listing: no licence" }, SU);
  check("a failure keeps its reason", failed.json?.publish?.status === "failed" && /no licence/.test(failed.json.publish.error), JSON.stringify(failed.json).slice(0, 200));
  const rmV = await api("GET", "/api/marketplace/publish/next", undefined, SU); await api("POST", `/api/marketplace/publish/${rmV.json?.id}/done`, {}, SU);
  const rmR = await api("GET", "/api/marketplace/publish/next", undefined, SU); await api("POST", `/api/marketplace/publish/${rmR.json?.id}/done`, { commit: "def" }, SU);
  check("the removal's validation and then its retirement are claimed in order", rmV.json?.kind === "validate" && rmV.json.issue === 9 && rmR.json?.kind === "retire" && rmR.json.issue === 9, JSON.stringify([rmV.json, rmR.json]).slice(0, 300));
  check("nothing left: 204", (await api("GET", "/api/marketplace/publish/next", undefined, SU)).status === 204);
  const byHand = await api("POST", "/api/marketplace/publish", { repository: "Example/voidbase-plugin-echo", ref: "v0.3.0", reason: "a maintainer" }, SU);
  check("a version queued by hand: repository lowercased, ref kept, build started", byHand.status === 200 && byHand.json.publish?.repository === "example/voidbase-plugin-echo" && byHand.json.publish.ref === "v0.3.0" && byHand.json.started === "started", JSON.stringify(byHand.json).slice(0, 200));
  check("neither an issue nor a repository is refused", (await api("POST", "/api/marketplace/publish", { reason: "?" }, SU)).status === 400);
  const retireByHand = await api("POST", "/api/marketplace/publish", { repository: "example/voidbase-plugin-echo", kind: "retire", reason: "a maintainer" }, SU);
  check("a retirement queued by hand: kind retire, the repository named, no ref", retireByHand.status === 200 && retireByHand.json.publish?.kind === "retire" && retireByHand.json.publish.repository === "example/voidbase-plugin-echo", JSON.stringify(retireByHand.json).slice(0, 200));
  const cron = await api("POST", "/api/crons/refresh", undefined, SU);
  // the tick answers before it is over: the row is polled for
  let list = await api("GET", "/api/marketplace/publish", undefined, SU); let fromCron: { kind: string; reason: string } | undefined;
  for (let i = 0; i < 40 && !fromCron; i++) { list = await api("GET", "/api/marketplace/publish", undefined, SU); fromCron = (list.json?.publishes ?? []).find((p: { ref: string }) => p.ref === "v0.2.0"); if (!fromCron) await Bun.sleep(250); }
  check("the daily check finds the tag the index does not serve and queues it", cron.status < 400 && !!fromCron && fromCron.kind === "publish" && /daily check: echo tagged v0.2.0/.test(fromCron.reason), `${cron.status} ${JSON.stringify(list.json).slice(0, 300)}`);
  await api("POST", "/api/crons/refresh", undefined, SU); await Bun.sleep(1500);
  const again = (await api("GET", "/api/marketplace/publish", undefined, SU)).json.publishes.filter((p: { ref: string }) => p.ref === "v0.2.0");
  check("run again, the queued version is not queued twice", again.length === 1, String(again.length));

  // ---- themes ----------------------------------------------------------------------------------------------------
  const themeIssue = { number: 11, title: "[theme] Midnight", labels: [{ name: "theme" }], user: { login: "someone" } };
  const tOpened = await hook("issues", { action: "opened", issue: themeIssue });
  const tApproved = await hook("issues", { action: "labeled", label: { name: "approved" }, issue: { ...themeIssue, labels: [...themeIssue.labels, { name: "approved" }] } });
  check("a theme submission is validated when opened and queued to publish when a maintainer approves it", tOpened.json?.queued?.kind === "validate" && tOpened.json.queued.issue === 11 && tApproved.json?.queued?.kind === "publish" && tApproved.json.queued.issue === 11, JSON.stringify([tOpened.json, tApproved.json]).slice(0, 300));

  const good = await auditTheme("example/voidbase-theme-midnight");
  const bare = await auditTheme("example/voidbase-theme-bare");
  check("the submission audit reads theme.json at the commit, and a repository without one cannot be listed",
    !good.blocking.length && good.commit === SHA("voidbase-theme-midnight") && good.report.checks.some((c) => c.name === "carries what it declares" && c.passed) && bare.blocking.some((b) => /theme\.json/.test(b)),
    JSON.stringify([good.blocking, good.report.checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`), bare.blocking]).slice(0, 400));

  // the pipeline writes into a copy of this repository's registry, so a test never touches the real one
  const mp = join(data, "mp"); mkdirSync(mp, { recursive: true });
  cpSync(resolve(import.meta.dir, "../registry"), join(mp, "registry"), { recursive: true });
  const listed = JSON.parse(readFileSync(join(mp, "registry/themes.json"), "utf8")) as { entries: unknown[] };
  listed.entries.push({ repository: "example/voidbase-theme-midnight", title: "Midnight", summary: "A dark theme.", submittedBy: "someone", issue: 11, listedOn: "2026-09-11", category: "Panel", tags: ["Dark"] });
  writeFileSync(join(mp, "registry/themes.json"), `${JSON.stringify(listed, null, 2)}\n`);
  type ThemeRecord = { version: string; manifest: { name: string; carries: { public?: string; styles?: string[] } }; integrity: string; bytes: number; base: string; files: { path: string; bytes: number; integrity: string }[] };
  const built = await publishTheme("example/voidbase-theme-midnight", undefined, { root: mp, log: () => {} });
  const record = built.written ? (JSON.parse(readFileSync(join(mp, "registry/v1/themes/midnight/1.0.0.json"), "utf8")) as ThemeRecord) : null;
  const css = record?.files.find((f) => f.path === "pb_public/theme.css");
  const onDisk = record && css ? join(mp, "registry/v1", record.base, css.path) : "";
  const servedRight = !!onDisk && existsSync(onDisk) && (await integrityOf(new Uint8Array(readFileSync(onDisk)))) === css!.integrity;
  check("a theme is published: the files it declares are served where the record says, each with the hash the record promises",
    built.written && built.files.length === 4 && record?.manifest.name === "midnight" && record.base === "themes/midnight/1.0.0" && record.files.every((f) => /^(pb_public|styles)\//.test(f.path)) && servedRight,
    JSON.stringify([built.blocking, built.files.map((f) => f.path)]).slice(0, 400));

  const loud = await publishTheme("example/voidbase-theme-loud", undefined, { root: mp, log: () => {} });
  const absent = await publishTheme("example/voidbase-theme-absent", undefined, { root: mp, log: () => {} });
  check("the audit refuses JavaScript in an overlay, and a theme that declares a file it does not carry; neither is written",
    !loud.written && /JavaScript/.test(loud.blocking.join(" ")) && !absent.written && /styles\/missing\.scss/.test(absent.blocking.join(" ")) && !existsSync(join(mp, "registry/v1/themes/loud")),
    JSON.stringify([loud.blocking, absent.blocking]).slice(0, 400));

  type IdxListing = { kind: string; name: string; latest: string; versions: { version: string }[] };
  const idx = buildIndex(mp) as unknown as { plugins: IdxListing[]; themes: IdxListing[]; templates: { kind: string }[] };
  const older = problemsWithIndex(idx);
  check("the index carries the theme beside the plugins, every listing with its kind, and an older client reads it unchanged",
    idx.themes.length === 1 && idx.themes[0]!.kind === "theme" && idx.themes[0]!.name === "midnight" && idx.themes[0]!.latest === "1.0.0"
    && idx.plugins.every((p) => p.kind === "plugin") && idx.templates.every((t) => t.kind === "template")
    && !older.length && pick(idx as unknown as RegistryIndex, "midnight") === null && pick(idx as unknown as RegistryIndex, "auth")?.version === "0.1.0",
    JSON.stringify(older).slice(0, 300));

  // ---- the diff ---------------------------------------------------------------------------------------------------
  const dOk = await api("GET", "/registry/v1/plugins/auth/diff?from=0.1.0");
  const dBad = await api("GET", "/registry/v1/plugins/auth/diff?from=9.9.9");
  const dGone = await api("GET", "/registry/v1/plugins/nope/diff?from=0.1.0");
  const dApi = await api("GET", "/api/registry/v1/plugins/auth/diff?from=0.1.0");
  check("the diff is served at its own address and at the /api one the deployed asset layer redirects to, and refuses a version or a name it does not serve",
    dOk.status === 200 && dOk.json?.name === "auth" && dOk.json.to?.version === "0.1.0" && dOk.json.from?.audit?.passed > 0 && dOk.json.files === null && dOk.json.unknown?.length > 0
    && dBad.status === 400 && /9\.9\.9 is not a version/.test(dBad.json?.message ?? "") && dGone.status === 400 && /nothing is served under the name/.test(dGone.json?.message ?? "")
    && dApi.status === 200 && JSON.stringify(dApi.json) === JSON.stringify(dOk.json),
    `${dOk.status} ${JSON.stringify(dOk.json).slice(0, 300)}`);

  const older1: ReleaseRecord = { version: "0.1.0", manifest: { name: "echo", version: "0.1.0", tier: "community", voidbase: "*", requires: ["realtime@1"] }, integrity: "sha256-a", bundle: "plugins/echo/0.1.0/bundle.js", bytes: 400, source: { repository: "example/voidbase-plugin-echo", commit: "a".repeat(40) }, publishedOn: "2026-09-01", audit: { ranOn: "2026-09-01T00:00:00.000Z", checks: [{ name: "has a licence", passed: true, detail: "MIT" }] } };
  const mid: ReleaseRecord = { ...older1, version: "0.2.0", manifest: { ...older1.manifest, version: "0.2.0", requires: ["realtime@1", "auth@1"], collections: ["echoes"], extends: { users: [{ name: "echoed" }] } }, integrity: "sha256-b", bytes: 520, publishedOn: "2026-09-05", files: [{ path: "package.json", bytes: 200 }, { path: "src/index.ts", bytes: 900 }, { path: "src/old.ts", bytes: 50 }], audit: { ranOn: "2026-09-05T00:00:00.000Z", checks: [{ name: "has a licence", passed: true, detail: "MIT" }, { name: "nothing obviously alarming in the source", passed: false, detail: "src/index.ts calls eval" }] } };
  const newest: ReleaseRecord = { ...mid, version: "0.3.0", manifest: { ...mid.manifest, version: "0.3.0" }, integrity: "sha256-c", bytes: 600, publishedOn: "2026-09-09", files: [{ path: "package.json", bytes: 240 }, { path: "src/index.ts", bytes: 900 }, { path: "src/echo.ts", bytes: 120 }] };
  const reg = { marketplace: { name: "test", url: MP }, plugins: [{ name: "echo", repository: "example/voidbase-plugin-echo", title: "Echo", summary: "x", latest: "0.3.0", versions: [older1, mid, newest] }] };
  const d1 = diffIn(reg, "echo", "0.1.0", "0.2.0") as Diff;
  check("the diff names what the manifest now asks for and what each side's audit found, and says unknown for a release published without a file list",
    d1.manifest.requires.added.join() === "auth@1" && d1.manifest.collections.added.join() === "echoes" && d1.manifest.extends.added.join() === "users.echoed"
    && !d1.manifest.requires.removed.length && d1.from.files === "unknown" && d1.to.files === "known" && d1.files === null
    && d1.unknown.some((u) => /0\.1\.0/.test(u)) && d1.from.audit !== "unknown" && d1.from.audit.failed === 0 && d1.to.audit !== "unknown" && d1.to.audit.failing.join() === "nothing obviously alarming in the source",
    JSON.stringify(d1).slice(0, 400));
  const d2 = diffIn(reg, "echo", "0.2.0") as Diff;
  check("between two releases that both recorded one, the diff names the files added, removed and changed by path and size",
    d2.to.version === "0.3.0" && d2.files?.added.map((f) => f.path).join() === "src/echo.ts" && d2.files.removed.map((f) => f.path).join() === "src/old.ts"
    && d2.files.changed.length === 1 && d2.files.changed[0]!.path === "package.json" && d2.files.changed[0]!.from === 200 && d2.files.changed[0]!.to === 240
    && d2.files.unchanged === 1 && !d2.unknown.length && !d2.manifest.requires.added.length && d2.bundle.sameIntegrity === false,
    JSON.stringify(d2.files).slice(0, 400));
} finally {
  for (const p of procs) p.kill(); gh.stop(true); own.stop(true);
  rmSync(data, { recursive: true, force: true }); rmSync(repos, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\n--- server log tail ---"); console.log(log.join("").split("\n").slice(-25).join("\n")); }
  process.exit(fail ? 1 : 0);
}
