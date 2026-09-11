// GET /api/registry/v1/plugins/:name/diff?from=<version>[&to=<version>] — the diff, at the address the Worker
// actually answers on Cloudflare. The registry's own address for it is /registry/v1/plugins/<name>/diff, which the
// deployed asset layer carries here (public/_redirects); both run the same handler (src/server/diff.ts).
import { defineHandler } from "void";
import { diffAnswer } from "@/server";

export const GET = defineHandler((c) => diffAnswer(c.req.param("name") ?? "", c.req.query("from") ?? "", c.req.query("to") || undefined));
