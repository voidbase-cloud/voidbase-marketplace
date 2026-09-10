// POST /api/marketplace/publish/:id/done { version?, commit? } — the build did it; the run is told.
import { defineHandler } from "void";
import { pb, requireSuperuser } from "@voidbase-cloud/voidbase/adapter";
import { publishJSON, reportPublish, type HookRecord } from "@/server";

export const POST = defineHandler(requireSuperuser(), async (c) => {
  const row = (await pb.$app.findRecordById("mp_publishes", c.req.param("id") ?? "")) as HookRecord | null; if (!row) throw new pb.NotFoundError();
  const body = (await c.req.raw.clone().json().catch(() => ({}))) as { version?: string; commit?: string };
  row.set("status", "done"); row.set("error", ""); if (body.version) row.set("version", String(body.version)); if (body.commit) row.set("commit", String(body.commit));
  await pb.$app.save(row);
  await reportPublish(c, row, { version: body.version, commit: body.commit });
  return { publish: publishJSON(row) };
});
