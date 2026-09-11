// POST /api/marketplace/github/webhook — GitHub's `issues` events for this repository, signed with MP_WEBHOOK_SECRET.
//
// A submission opened or edited is queued for validation (the audit comment); one labelled `approved` is queued for
// publishing (listed, built, committed, answered, closed). A removal ("[remove] owner/name" in the title, or the
// `remove` label) labelled `approved` is queued for retiring. That is the whole maintainer flow: read the comment,
// add the label. MARKETPLACE_SUBMISSIONS off (Flagship) answers 200 and queues nothing, which pauses submissions without
// touching GitHub.
import { defineHandler } from "void";
import { env, on, publishJSON, queuePublish, signedBy } from "@/server";

const SUBMISSION = ["template", "plugin", "theme"];

export const POST = defineHandler(async (c) => {
  const body = await c.req.raw.text();
  if (!(await signedBy(env("MP_WEBHOOK_SECRET"), body, c.req.header("x-hub-signature-256")))) return new Response(JSON.stringify({ message: "bad signature" }), { status: 401, headers: { "content-type": "application/json" } });
  const event = c.req.header("x-github-event") ?? "";
  if (event === "ping") return { pong: true };
  if (event !== "issues") return { ignored: event };
  if (!on("MARKETPLACE_SUBMISSIONS", true)) return { paused: true };
  const p = JSON.parse(body) as { action: string; issue: { number: number; title: string; labels: { name: string }[] }; label?: { name: string } };
  const labels = (p.issue.labels ?? []).map((l) => l.name);
  const isRemoval = labels.includes("remove") || /^\[remove\]/i.test(p.issue.title);
  const isSubmission = labels.some((l) => SUBMISSION.includes(l)) || /^\[(template|plugin|theme)\]/i.test(p.issue.title);
  if (!isSubmission && !isRemoval) return { ignored: "not a submission" };
  if (p.action === "labeled" && p.label?.name === "approved") {
    const r = await queuePublish(c, { issue: p.issue.number, kind: isRemoval ? "retire" : "publish", reason: `#${p.issue.number} approved` });
    return { queued: publishJSON(r.row), started: r.started, duplicate: r.duplicate };
  }
  if (p.action === "opened" || p.action === "edited" || p.action === "reopened") {
    const r = await queuePublish(c, { issue: p.issue.number, kind: "validate", reason: `#${p.issue.number} ${p.action}` });
    return { queued: publishJSON(r.row), started: r.started, duplicate: r.duplicate };
  }
  return { ignored: p.action };
});
