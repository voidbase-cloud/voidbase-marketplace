// The answer behind `GET /registry/v1/plugins/:name/diff` (src/lib/diff.ts works it out; this is what a route
// returns), in one place because two routes serve it.
//
// Two, because of where the Worker runs. On Cloudflare a voidbase instance is asset-first: the asset layer answers
// every path outside `/api` and the Worker is never invoked for one (voidbase, docs/platform.md), so the address the
// protocol names has to be carried to an `/api` path by a `_redirects` rule, the way the seo plugin carries
// /robots.txt to /api/seo/robots.txt. On Bun (`voidbase serve`, the test) the Worker sees every path and reads no
// `_redirects`, so the same handler is registered at the address itself. Both are the same function.
import { diffOf } from "@/lib/diff";

/**
 * A refusal is written rather than thrown, and it is a 400 whatever is wrong with the question (src/lib/diff.ts says
 * why): a thrown error, or any 404 outside `/api`, falls through to pb_public on a Bun instance, which would answer a
 * question about a plugin with a page of HTML.
 */
export function diffAnswer(name: string, from: string, to?: string): Response | Record<string, unknown> {
  const answer = diffOf(name, from, to);
  if (!("error" in answer)) return answer as unknown as Record<string, unknown>;
  return new Response(`${JSON.stringify({ status: answer.status, message: answer.error }, null, 2)}\n`, { status: answer.status, headers: { "content-type": "application/json" } });
}
