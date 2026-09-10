// The `(publish)` build, started through the Builds API and watched through it: the marketplace Worker's second
// trigger (a push never starts it; its watch paths exclude everything), which runs scripts/publish-build.ts. The
// same shape voidbase.cloud uses for its instance builder.
import { env } from "./pb";

const API = () => (env("CLOUDFLARE_API_BASE") || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
const uuids = new Map<string, string>();

async function cf<T>(token: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API()}${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "voidbase-marketplace" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message?: string }[] };
  if (!r.ok || j.success === false) throw new Error(`${path}: ${r.status} ${j.errors?.map((e) => e.message).join("; ") || ""}`.trim());
  return j.result as T;
}
const account = () => env("MP_BUILDS_ACCOUNT") || env("VOIDBASE_ACCOUNT_ID");
const worker = () => env("VOIDBASE_WORKER_NAME", "voidbase-marketplace");

async function triggerOf(token: string, acct: string, name: string): Promise<string> {
  const key = `${acct}/${worker()}/${name}`; const known = uuids.get(key); if (known) return known;
  const tag = (await cf<{ id: string; tag?: string }[]>(token, `/accounts/${acct}/workers/scripts`)).find((s) => s.id === worker())?.tag;
  if (!tag) throw new Error(`no Worker ${worker()} on account ${acct}`);
  const t = (await cf<{ trigger_uuid: string; trigger_name: string }[]>(token, `/accounts/${acct}/builds/workers/${tag}/triggers`)).find((x) => x.trigger_name === name);
  if (!t) throw new Error(`no trigger "${name}" on ${worker()}`);
  uuids.set(key, t.trigger_uuid); return t.trigger_uuid;
}

export type BuildStart = { status: "started" | "no-token" | "failed"; build?: string };
/** start the publish build (master's scripts) */
export async function startPublisher(reason: string): Promise<BuildStart> {
  const token = env("MP_BUILDS_TOKEN"); if (!token) return { status: "no-token" };
  const acct = account(); if (!acct) { console.warn("marketplace: publish build", reason, "no account (MP_BUILDS_ACCOUNT)"); return { status: "failed" }; }
  try {
    const uuid = await triggerOf(token, acct, env("MP_PUBLISH_TRIGGER", "voidbase-marketplace (publish)"));
    const r = await cf<{ build_uuid?: string; status?: string }>(token, `/accounts/${acct}/builds/triggers/${uuid}/builds`, { branch: env("MP_BUILDS_BRANCH", "master") });
    console.log(`marketplace: publish build ${r.build_uuid ?? "?"} ${r.status ?? "queued"}: ${reason}`);
    return { status: "started", build: r.build_uuid };
  } catch (err) { uuids.clear(); console.warn("marketplace: publish build", reason, err instanceof Error ? err.message : err); return { status: "failed" }; }
}

/** "running", "success", a failure Cloudflare names, or "unknown" */
export async function buildState(build: string): Promise<string> {
  const token = env("MP_BUILDS_TOKEN"); const acct = account(); if (!token || !acct) return "unknown";
  try {
    const b = await cf<{ status?: string; build_outcome?: string }>(token, `/accounts/${acct}/builds/builds/${build}`);
    const st = b.status ?? "";
    if (st === "stopped") return b.build_outcome === "success" ? "success" : b.build_outcome || "stopped";
    if (["success", "failure", "failed", "canceled", "cancelled", "terminated", "timed_out", "error"].includes(st)) return st === "failure" ? "failed" : st;
    return "running";
  } catch (err) { console.warn("marketplace: build state", build, err instanceof Error ? err.message : err); return "unknown"; }
}
