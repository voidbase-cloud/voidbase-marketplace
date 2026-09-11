// GET /registry/v1/plugins/:name/diff?from=<version>[&to=<version>] — what changed between the version an instance
// has and the newest this marketplace serves: files added, removed and changed by path and size, the capabilities the
// manifest now asks for, and the audit's verdict on both sides (src/lib/diff.ts).
//
// The rest of /registry/v1 is static files. This one is a question with an argument, so it is the only part of the
// registry a server answers: on Bun here, and on Cloudflare at /api/registry/v1/plugins/:name/diff, which
// public/_redirects sends this address to because the Worker there only runs for /api (src/server/diff.ts).
import { defineHandler } from "void";
import { diffAnswer } from "@/server";

export const GET = defineHandler((c) => diffAnswer(c.req.param("name") ?? "", c.req.query("from") ?? "", c.req.query("to") || undefined));
