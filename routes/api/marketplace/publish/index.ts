// GET  /api/marketplace/publish   the queue, newest first (superusers)
// POST /api/marketplace/publish   queue one: { repository, ref } for a version, { issue } for a submission,
//                                 kind "publish" (default) or "validate"
import { defineHandler } from "void";
import { pb, requireSuperuser } from "@voidbase-cloud/voidbase/adapter";
import { publishJSON, queuePublish, type HookRecord, type Kind } from "@/server";

export const GET = defineHandler(requireSuperuser(), async () => {
  const rows = (await pb.$app.findRecordsByFilter("mp_publishes", "id != ''", "-created", 50, 0)) as HookRecord[];
  return { publishes: rows.map(publishJSON) };
});

export const POST = defineHandler(requireSuperuser(), async (c) => {
  const body = (await c.req.raw.clone().json().catch(() => ({}))) as Record<string, unknown>;
  const issue = Number(body.issue ?? 0) || 0; const repository = String(body.repository ?? "").trim().toLowerCase(); const ref = String(body.ref ?? "").trim();
  const kind: Kind = body.kind === "validate" ? "validate" : "publish";
  if (!issue && !/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(repository)) throw new pb.BadRequestError("Say which: { issue } for a submission, or { repository, ref } for a version.");
  if (kind === "validate" && !issue) throw new pb.BadRequestError("A validation is of an issue.");
  const r = await queuePublish(c, { repository: issue ? undefined : repository, ref: issue ? undefined : ref, issue: issue || undefined, kind, reason: String(body.reason ?? "queued by hand") });
  return { publish: publishJSON(r.row), started: r.started, duplicate: r.duplicate };
});
