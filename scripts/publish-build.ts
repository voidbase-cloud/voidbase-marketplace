// The publish build: what the `voidbase-marketplace (publish)` trigger runs (never on push; the marketplace starts
// it through the Builds API when something is queued). It claims queued rows from the marketplace, does each one
// with the scripts a maintainer would run by hand, commits and pushes the registry, answers the issue, and reports.
//
//   bun scripts/publish-build.ts          env: MP_URL, MP_BUILD_EMAIL, MP_BUILD_PASSWORD (the marketplace's
//                                         superuser), GH_TOKEN (commits to this repository, issue comments)
//
// The push is what deploys: the master trigger builds the commit and syncs the instance.
import { must } from "./submission";

const MP = (process.env.MP_URL ?? "https://marketplace.voidbase.cloud").replace(/\/+$/, "");
const REPO = process.env.MARKETPLACE_REPO ?? "voidbase-cloud/voidbase-marketplace";
const token = process.env.GH_TOKEN ?? "";
const ua = { "user-agent": "voidbase-marketplace-publish/1" };
const api = async (method: string, path: string, body?: unknown, auth?: string) => { const r = await fetch(MP + path, { method, headers: { "content-type": "application/json", ...ua, ...(auth ? { authorization: auth } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); let json: any = null; try { json = await r.json(); } catch { /* 204 */ } return { status: r.status, json }; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const quiet = (cmd: string[]) => { const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" }); return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }; };

if (!process.env.MP_BUILD_EMAIL || !process.env.MP_BUILD_PASSWORD) { console.error("MP_BUILD_EMAIL and MP_BUILD_PASSWORD are not set on this trigger"); process.exit(1); }
if (!token) { console.error("GH_TOKEN is not set on this trigger: nothing could be committed"); process.exit(1); }
const login = await api("POST", "/api/collections/_superusers/auth-with-password", { identity: process.env.MP_BUILD_EMAIL, password: process.env.MP_BUILD_PASSWORD });
const SU = login.json?.token as string | undefined; if (!SU) { console.error(`cannot sign in to ${MP} as the build superuser (${login.status})`); process.exit(1); }

// git as the build: a name, and a remote the token can push to (the build image's helper would push as the app bot)
must(["git", "config", "user.name", "voidbase marketplace"]); must(["git", "config", "user.email", "marketplace@voidbase.cloud"]);
must(["git", "remote", "set-url", "origin", `https://x-access-token:${token}@github.com/${REPO}.git`]);
must(["git", "fetch", "-q", "origin", "master"]); must(["git", "checkout", "-q", "-B", "master", "origin/master"]);

let done = 0, failed = 0;
for (;;) {
  const next = await api("GET", "/api/marketplace/publish/next", undefined, SU);
  if (next.status === 204) break;
  if (next.status !== 200) { console.error(`publish/next: ${next.status} ${JSON.stringify(next.json).slice(0, 200)}`); process.exit(1); }
  const job = next.json as { id: string; kind: string; repository: string; ref: string; issue: number | null; reason: string };
  const label = job.issue ? `#${job.issue} (${job.kind})` : `${job.repository}@${job.ref || "default"}`;
  console.log(`\n=== ${label}: ${job.reason}`);
  const fail = async (error: string) => { failed++; console.error(`${label}: ${error.split("\n")[0]}`); await api("POST", `/api/marketplace/publish/${job.id}/failed`, { error: error.slice(0, 2000) }, SU); };
  try {
    if (job.kind === "validate") {
      const r = quiet(["bun", "scripts/validate.ts", "--issue", String(job.issue), "--post"]);
      if (r.code !== 0) { await fail(r.out.slice(-1500)); continue; }
      console.log(r.out.trim().split("\n").slice(-3).join("\n"));
    } else if (job.issue) {
      const r = quiet(["bun", "scripts/approve.ts", "--issue", String(job.issue)]);
      if (r.code !== 0) { await fail(r.out.slice(-1500)); continue; }
      console.log(r.out.trim().split("\n").slice(-3).join("\n"));
    } else {
      const r = quiet(["bun", "scripts/bundle.ts", job.repository, ...(job.ref ? [job.ref] : [])]);
      // a version this marketplace already serves is nothing to do, not a failure (a daily check or a hand can ask twice)
      const served = /is already published/.test(r.out);
      if (r.code !== 0 && !served) { await fail(r.out.slice(-1500)); continue; }
      console.log(served ? `already served: ${r.out.match(/(\S+ \d+\.\d+\.\d+\S*) is already published/)?.[1] ?? "this version"}` : r.out.trim().split("\n").slice(-3).join("\n"));
      const check = quiet(["bun", "scripts/registry.ts", "check"]); if (check.code !== 0) { await fail(`the registry check refused the result:\n${check.out.slice(-1500)}`); continue; }
      const changed = quiet(["git", "status", "--porcelain", "--", "registry"]).out.trim();
      if (changed) { must(["git", "add", "registry"]); must(["git", "commit", "-q", "-m", `feat(registry): ${job.repository} at ${job.ref || "its default branch"}`]); must(["git", "push", "-q", "origin", "HEAD:master"]); }
      else console.log("already served: nothing to commit");
    }
    const version = (job.ref.match(/\d+\.\d+\.\d+\S*/) ?? quiet(["git", "log", "-1", "--format=%s"]).out.match(/\d+\.\d+\.\d+\S*/))?.[0];
    const commit = quiet(["git", "rev-parse", "HEAD"]).out.trim();
    await api("POST", `/api/marketplace/publish/${job.id}/done`, { version, commit }, SU);
    done++; console.log(`${label}: done (${commit.slice(0, 7)})`);
  } catch (err) { await fail(err instanceof Error ? err.message : String(err)); }
}
console.log(`\n${done} done, ${failed} failed`);
process.exit(failed ? 1 : 0);
