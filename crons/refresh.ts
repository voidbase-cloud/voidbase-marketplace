// The daily version check: every listed plugin's repository is asked for its tags, and a tag this marketplace does
// not serve yet is queued for publishing. New versions flow without anybody running the pipeline by hand;
// MARKETPLACE_AUTO_VERSIONS off (Flagship) turns the check into a no-op. Nothing here throws: a tick that fails logs why.
import { defineScheduled } from "void";
import { pb } from "@voidbase-cloud/voidbase/adapter";
import { env, on, queuePublish, type HookRecord } from "@/server";

export const cron = "0 6 * * *";

const VERSION_TAG = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const GH = () => (env("GITHUB_API_URL") || "https://api.github.com").replace(/\/$/, "");

/** the versions a repository tags that the index does not serve */
async function missing(repository: string, served: Set<string>): Promise<string[]> {
  const r = await fetch(`${GH()}/repos/${repository}/tags?per_page=20`, { headers: { accept: "application/vnd.github+json", "user-agent": "voidbase-marketplace", ...(env("MP_GH_TOKEN") ? { authorization: `Bearer ${env("MP_GH_TOKEN")}` } : {}) } });
  if (!r.ok) throw new Error(`${repository}: tags ${r.status}`);
  const tags = (await r.json()) as { name: string }[];
  return tags.map((t) => t.name).filter((t) => { const m = VERSION_TAG.exec(t); return m && !served.has(m[1]!); });
}

export default defineScheduled(async () => {
  if (!on("MARKETPLACE_AUTO_VERSIONS", true)) { console.log("refresh: MARKETPLACE_AUTO_VERSIONS is off; nothing checked"); return; }
  let index: { plugins: { name: string; repository: string; versions: { version: string }[] }[] };
  try { index = (await (await fetch(`${env("MP_URL", "https://marketplace.voidbase.cloud")}/registry/v1/index.json`, { headers: { "user-agent": "voidbase-marketplace" } })).json()) as typeof index; }
  catch (err) { console.warn("refresh: the index could not be read", err instanceof Error ? err.message : err); return; }
  let queued = 0;
  for (const p of index.plugins) {
    try {
      const served = new Set(p.versions.map((v) => v.version));
      for (const tag of await missing(p.repository, served)) {
        // a failure within the week is not retried by the clock: a person looks at it first
        const recent = (await pb.$app.findRecordsByFilter("mp_publishes", "repository = {:r} && ref = {:ref} && status = 'failed' && created > {:since}", "-created", 1, 0, { r: p.repository, ref: tag, since: new Date(Date.now() - 7 * 86_400_000).toISOString().replace("T", " ") })) as HookRecord[];
        if (recent.length) continue;
        const r = await queuePublish({ env: undefined }, { repository: p.repository, ref: tag, kind: "publish", reason: `daily check: ${p.name} tagged ${tag}` });
        if (!r.duplicate) { queued++; console.log(`refresh: ${p.name} ${tag} queued (${r.started})`); }
      }
    } catch (err) { console.warn("refresh:", p.name, err instanceof Error ? err.message : err); }
  }
  console.log(`refresh: ${index.plugins.length} plugin(s) checked, ${queued} version(s) queued`);
});
