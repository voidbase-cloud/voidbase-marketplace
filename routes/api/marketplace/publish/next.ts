// GET /api/marketplace/publish/next — the publish build claims the next queued row (a superuser, from CI).
// 204 when nothing is queued. A claim marks it building so two builds do not do it twice.
import { defineHandler } from "void";
import { pb, requireSuperuser } from "@voidbase-cloud/voidbase/adapter";
import { publishJSON, type HookRecord } from "@/server";

export const GET = defineHandler(requireSuperuser(), async () => {
  const rows = (await pb.$app.findRecordsByFilter("mp_publishes", "status = 'queued'", "created", 1, 0)) as HookRecord[];
  const row = rows[0]; if (!row) return new Response(null, { status: 204 });
  row.set("status", "building"); await pb.$app.save(row);
  return publishJSON(row);
});
