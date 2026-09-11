// The publish queue (mp_publishes): a row is one thing the pipeline has to make real, a run watches it, and the
// `(publish)` build does the work. Three kinds of row:
//   publish of an issue     a submission a maintainer approved (the `approved` label): list it, build a plugin, commit, answer, close
//   publish of a version    a listed plugin's new tag (the daily check, or a maintainer): build it, commit
//   validate of an issue    a submission just opened or edited: audit it and comment, so the decision is cheap
//   retire                  a listing leaves (a removal issue a maintainer approved, or a maintainer by hand)
import { pb, type HookRecord } from "./pb";
import { startPublisher } from "./builds";

export type Kind = "publish" | "validate" | "retire";
export interface PublishInput { repository?: string; ref?: string; issue?: number; kind: Kind; reason: string }
type Ctx = { env: unknown };
interface Runs { create(o: { id: string; params: { publishId: string } }): Promise<unknown>; get(id: string): Promise<{ sendEvent(e: { type: string; payload: unknown }): Promise<unknown> }> }
const runsOf = (c: Ctx): Runs | undefined => { const w = (c.env as Record<string, unknown> | undefined)?.WORKFLOW_PUBLISH as Runs | undefined; return w && typeof w.create === "function" ? w : undefined; };

export const publishJSON = (r: HookRecord) => ({ id: r.id, repository: r.getString("repository"), ref: r.getString("ref"), issue: Number(r.get("issue") ?? 0) || null, kind: r.getString("kind"), status: r.getString("status"), reason: r.getString("reason"), version: r.getString("version"), commit: r.getString("commit"), error: r.getString("error"), build: r.getString("build"), created: String(r.get("created") ?? ""), updated: String(r.get("updated") ?? "") });

/** a row already queued or building for the same thing: the queue holds one of each */
export async function pending(input: PublishInput): Promise<HookRecord | null> {
  const filter = input.issue ? `issue = ${input.issue} && kind = {:k} && (status = 'queued' || status = 'building')` : `repository = {:r} && ref = {:ref} && kind = {:k} && (status = 'queued' || status = 'building')`;
  try { return (await pb.$app.findFirstRecordByFilter("mp_publishes", filter, { k: input.kind, r: input.repository ?? "", ref: input.ref ?? "" })) as HookRecord; } catch { return null; }
}

/**
 * Queue one thing and start its run. With the Workflow bound (Cloudflare) the run starts the publish build and
 * watches it; without it (Bun, the mocked suite) the build is started here and nothing watches the clock. The
 * request that queued it never fails because the build could not be started: the row says so.
 */
export async function queuePublish(c: Ctx, input: PublishInput): Promise<{ row: HookRecord; started: string; duplicate: boolean }> {
  const dup = await pending(input);
  if (dup) return { row: dup, started: "already", duplicate: true };
  const row = new pb.Record(pb.$app.findCollectionByNameOrId("mp_publishes")) as HookRecord;
  row.set("repository", input.repository ?? ""); row.set("ref", input.ref ?? ""); if (input.issue) row.set("issue", input.issue);
  row.set("kind", input.kind); row.set("status", "queued"); row.set("reason", input.reason.slice(0, 200));
  await pb.$app.save(row);
  const runs = runsOf(c);
  if (runs) {
    // the run's id is on the row before the run exists: a step may read the row at once, and a save from a stale
    // copy would write the id away
    const id = `${row.id}-${Date.now().toString(36)}`;
    row.set("run", id); await pb.$app.save(row);
    try { await runs.create({ id, params: { publishId: row.id } }); return { row, started: "workflow", duplicate: false }; }
    catch (err) { console.warn("marketplace: publish run", err instanceof Error ? err.message : err); row.set("run", ""); await pb.$app.save(row); }
  }
  const s = await startPublisher(input.reason); if (s.build) { row.set("build", s.build); await pb.$app.save(row); }
  return { row, started: s.status, duplicate: false };
}

/** the build reported: tell the run, which may already be over */
export async function reportPublish(c: Ctx, row: HookRecord, report: { version?: string; commit?: string; error?: string }): Promise<void> {
  const runs = runsOf(c); const id = row.getString("run"); if (!runs || !id) return;
  try { await (await runs.get(id)).sendEvent({ type: "published", payload: report }); } catch (err) { console.warn("marketplace: publish report", id, err instanceof Error ? err.message : err); }
}
