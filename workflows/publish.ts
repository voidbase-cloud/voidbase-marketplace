// One publish, as a durable run: start the `(publish)` build, watch it while waiting for its report, start it once
// more when Cloudflare loses it, and record a failure when nothing comes of it. The build itself does the work
// (scripts/publish-build.ts) and reports through publish/:id/done or /failed, which send this run its event.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { pb } from "@voidbase-cloud/voidbase/adapter";
import { withApp } from "@voidbase-cloud/voidbase/workflows";
import { buildState, startPublisher, type BuildStart } from "@/server";

export type PublishParams = { publishId: string };
export type PublishReport = { version?: string; commit?: string; error?: string };
const ROUND = "2 minutes", ROUNDS = 15, ATTEMPTS = 2;

export default class Publish extends WorkflowEntrypoint<Record<string, unknown>, PublishParams> {
  async run(event: WorkflowEvent<PublishParams>, step: WorkflowStep): Promise<PublishReport> {
    const { publishId } = event.payload;
    const app = <T>(fn: () => Promise<T>) => withApp(this.env as never, fn);
    let report: PublishReport | undefined;
    for (let attempt = 1; attempt <= ATTEMPTS && !report; attempt++) {
      const started = (await step.do(`start the publish build (${attempt})`, { retries: { limit: 5, delay: "30 seconds", backoff: "exponential" } }, () =>
        app(async (): Promise<BuildStart> => { const r = await startPublisher(`publish ${publishId}`); if (r.status === "failed") throw new Error("the publish build could not be started"); return r; }))) as BuildStart;
      if (started.status === "no-token") { report = { error: "no build was started: the marketplace has no MP_BUILDS_TOKEN to start the publish build with" }; break; }
      if (started.build) await step.do(`record the build (${attempt})`, () => app(async () => { const row = await pb.$app.findRecordById("mp_publishes", publishId); if (row) { row.set("build", started.build); await pb.$app.save(row); } }));
      let dead = "";
      for (let round = 1; round <= ROUNDS && !report && !dead; round++) {
        try { report = (await step.waitForEvent<PublishReport>(`the build reports (${attempt}.${round})`, { type: "published", timeout: ROUND })).payload; }
        catch { const state = started.build ? await step.do(`check the build (${attempt}.${round})`, () => app(() => buildState(started.build!))) : "unknown"; if (state !== "running" && state !== "unknown") dead = state; }
      }
      if (dead && attempt === ATTEMPTS) report = { error: `the publish build ${started.build} ended "${dead}" without reporting, twice; try again` };
      else if (!dead && !report) report = { error: `the publish build did not report back within 30 minutes (build ${started.build ?? "?"}); try again` };
    }
    if (report!.error) {
      await step.do("record the failure", () => app(async () => {
        const row = await pb.$app.findRecordById("mp_publishes", publishId);
        if (row && ["queued", "building"].includes(row.getString("status"))) { row.set("status", "failed"); row.set("error", report!.error); await pb.$app.save(row); }
      }));
    }
    return report!;
  }
}
