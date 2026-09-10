// POST /api/marketplace/publish/:id/failed { error } — the build could not; the reason is kept and the run told.
import { defineHandler } from "void";
import { pb, requireSuperuser } from "@voidbase-cloud/voidbase/adapter";
import { publishJSON, reportPublish, type HookRecord } from "@/server";

export const POST = defineHandler(requireSuperuser(), async (c) => {
  const row = (await pb.$app.findRecordById("mp_publishes", c.req.param("id") ?? "")) as HookRecord | null; if (!row) throw new pb.NotFoundError();
  const body = (await c.req.raw.clone().json().catch(() => ({}))) as { error?: string };
  const error = String(body.error ?? "the publish build failed without saying why").slice(0, 2000);
  row.set("status", "failed"); row.set("error", error); await pb.$app.save(row);
  await reportPublish(c, row, { error });
  return { publish: publishJSON(row) };
});
