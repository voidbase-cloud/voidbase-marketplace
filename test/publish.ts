// The publish pipeline on the Bun runtime, against mocks: voidbase's test/cf-mock.ts for the Builds API, a GitHub
// of this test's own for tags, and this marketplace's own index. Boots the built app (`bun run build` first).
//   bun test/publish.ts
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const VOIDBASE = resolve(import.meta.dir, "../node_modules/@voidbase-cloud/voidbase");
const MOCKS = [`${VOIDBASE}/test`, resolve(import.meta.dir, "../../voidbase/test")].find((d) => existsSync(`${d}/cf-mock.ts`)) ?? `${VOIDBASE}/test`;
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() }); const p = s.port; s.stop(true); return p; };
const CF_PORT = freePort(), MP_PORT = freePort();
const CF = `http://127.0.0.1:${CF_PORT}`, MP = `http://127.0.0.1:${MP_PORT}`;
let pass = 0, fail = 0; const check = (l: string, ok: boolean, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  " + d}`); };
const waitFor = async (url: string) => { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up */ } await Bun.sleep(150); } throw new Error(`${url} did not come up`); };

// a GitHub with one plugin repository that has a tag this marketplace does not serve, and the index that says so
const tags: Record<string, string[]> = { "example/voidbase-plugin-echo": ["v0.2.0", "v0.1.0"] };
const index = { schemaVersion: 1, marketplace: { name: "test", url: MP }, generatedOn: "2026-09-10", plugins: [{ name: "echo", repository: "example/voidbase-plugin-echo", title: "Echo", summary: "x", latest: "0.1.0", versions: [{ version: "0.1.0", manifest: { name: "echo", version: "0.1.0", tier: "community", voidbase: "*" }, integrity: "sha256-x", bundle: "plugins/echo/0.1.0/bundle.js", bytes: 1, source: { repository: "example/voidbase-plugin-echo", commit: "0".repeat(40) }, publishedOn: "2026-09-09" }] }], templates: [] };
const gh = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => { const m = new URL(req.url).pathname.match(/^\/repos\/([^/]+\/[^/]+)\/tags$/); return m ? Response.json((tags[m[1]!] ?? []).map((name) => ({ name }))) : Response.json({ message: "Not Found" }, { status: 404 }); } });
const GH = `http://127.0.0.1:${gh.port}`;
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
  check("a stranger's event with the right signature but no submission label is ignored", (await hook("issues", { action: "opened", issue: { number: 8, title: "bug: it broke", labels: [], user: { login: "x" } } })).json?.ignored === "not a submission");
  check("the queue is for superusers", (await api("GET", "/api/marketplace/publish/next")).status === 401 && (await api("GET", "/api/marketplace/publish")).status === 401);
  const first = await api("GET", "/api/marketplace/publish/next", undefined, SU);
  check("the publish build claims the oldest queued row: the validation, now building", first.status === 200 && first.json.kind === "validate" && first.json.issue === 7 && first.json.status === "building", JSON.stringify(first.json).slice(0, 200));
  const done = await api("POST", `/api/marketplace/publish/${first.json.id}/done`, { commit: "abc" }, SU);
  const second = await api("GET", "/api/marketplace/publish/next", undefined, SU);
  check("done records it; the next claim is the publish of the approved issue", done.json?.publish?.status === "done" && second.json?.kind === "publish" && second.json.issue === 7, JSON.stringify([done.json, second.json]).slice(0, 300));
  const failed = await api("POST", `/api/marketplace/publish/${second.json.id}/failed`, { error: "the audit blocks this listing: no licence" }, SU);
  check("a failure keeps its reason", failed.json?.publish?.status === "failed" && /no licence/.test(failed.json.publish.error), JSON.stringify(failed.json).slice(0, 200));
  check("nothing left: 204", (await api("GET", "/api/marketplace/publish/next", undefined, SU)).status === 204);
  const byHand = await api("POST", "/api/marketplace/publish", { repository: "Example/voidbase-plugin-echo", ref: "v0.3.0", reason: "a maintainer" }, SU);
  check("a version queued by hand: repository lowercased, ref kept, build started", byHand.status === 200 && byHand.json.publish?.repository === "example/voidbase-plugin-echo" && byHand.json.publish.ref === "v0.3.0" && byHand.json.started === "started", JSON.stringify(byHand.json).slice(0, 200));
  check("neither an issue nor a repository is refused", (await api("POST", "/api/marketplace/publish", { reason: "?" }, SU)).status === 400);
  const cron = await api("POST", "/api/crons/refresh", undefined, SU);
  // the tick answers before it is over: the row is polled for
  let list = await api("GET", "/api/marketplace/publish", undefined, SU); let fromCron: { kind: string; reason: string } | undefined;
  for (let i = 0; i < 40 && !fromCron; i++) { list = await api("GET", "/api/marketplace/publish", undefined, SU); fromCron = (list.json?.publishes ?? []).find((p: { ref: string }) => p.ref === "v0.2.0"); if (!fromCron) await Bun.sleep(250); }
  check("the daily check finds the tag the index does not serve and queues it", cron.status < 400 && !!fromCron && fromCron.kind === "publish" && /daily check: echo tagged v0.2.0/.test(fromCron.reason), `${cron.status} ${JSON.stringify(list.json).slice(0, 300)}`);
  await api("POST", "/api/crons/refresh", undefined, SU); await Bun.sleep(1500);
  const again = (await api("GET", "/api/marketplace/publish", undefined, SU)).json.publishes.filter((p: { ref: string }) => p.ref === "v0.2.0");
  check("run again, the queued version is not queued twice", again.length === 1, String(again.length));
} finally {
  for (const p of procs) p.kill(); gh.stop(true); own.stop(true);
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\n--- server log tail ---"); console.log(log.join("").split("\n").slice(-25).join("\n")); }
  process.exit(fail ? 1 : 0);
}
