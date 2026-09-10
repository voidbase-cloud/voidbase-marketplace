// The marketplace's configuration, declared once, each key stating who may read it. The same tiers voidbase uses
// everywhere: secret() for the Secrets Store, server() for plain Worker vars, flag() for Flagship, browser() for what
// is inlined into the static site, local() for tooling that never leaves this machine or CI.
//
// The listing itself needs none of these. The pipeline does: a submission or a new version becomes a row of
// mp_publishes, the publish Workflow starts the `(publish)` build through the Builds API, the build commits the
// registry and the push deploys it (src/server/publish.ts, scripts/publish-build.ts).
import { boolean, browser, defineSecrets, flag, local, secret, server, string, url } from "@voidbase-cloud/voidbase/secrets";

export default defineSecrets({
  // ---- local: the deploy itself
  VOIDBASE_DEPLOY_CF_API_KEY: local(string().optional(), "the deploy token (`voidbase token` prints the link that creates it)"),
  VOIDBASE_DEPLOY_NAME: local(string().default("voidbase-marketplace"), "the Worker this project deploys to"),
  VOIDBASE_DEPLOY_DOMAIN: local(string().default("marketplace.voidbase.cloud"), "its hostname"),
  VOIDBASE_DEPLOY_CRON: local(boolean().default(true), "the cron trigger the daily version check runs on"),
  CLOUDFLARE_BUILDS_TOKEN: local(string().optional(), "a user API token with Workers Builds Configuration: Edit, for `voidbase sync`"),

  // ---- secret: in the account's Secrets Store
  VOIDBASE_SUPERUSER_EMAIL: secret(string().optional(), "the admin panel superuser; the publish build claims work as it"),
  VOIDBASE_SUPERUSER_PASSWORD: secret(string().optional(), "its password"),
  MP_GH_TOKEN: secret(string().optional(), "a GitHub token that reads this repository's issues; the publish build commits and answers issues with the one on its trigger"),
  MP_BUILDS_TOKEN: secret(string().optional(), "a user API token with Workers Builds Configuration: Edit and Workers Scripts: Read, so a queued publish starts the `(publish)` build"),
  MP_WEBHOOK_SECRET: secret(string().optional(), "the secret the repository's GitHub webhook signs with (issues events reach /api/marketplace/github/webhook)"),

  // ---- server: plain Worker vars
  MP_URL: server(url().default("https://marketplace.voidbase.cloud"), "where this marketplace answers, for the cron to read its own index"),
  MP_REPO: server(string().default("voidbase-cloud/voidbase-marketplace"), "this repository, where submissions are issues"),
  MP_BUILDS_ACCOUNT: server(string().optional(), "the account the builds run on (defaults to this Worker's own)"),
  MP_PUBLISH_TRIGGER: server(string().default("voidbase-marketplace (publish)"), "the trigger whose build publishes (never on push)"),

  // ---- flag: Flagship, changed without a deploy
  MARKETPLACE_SUBMISSIONS: flag(boolean().default(true), "whether submission issues are picked up by the webhook; off pauses the queue without touching GitHub"),
  MARKETPLACE_AUTO_VERSIONS: flag(boolean().default(true), "whether the daily check publishes new tags of listed plugins on its own"),

  // ---- browser: what the listing pages are allowed to know
  PB_REPO_URL: browser(url().default("https://github.com/voidbase-cloud/voidbase-marketplace"), "this repository, which is where submissions happen"),
  PB_SITE_URL: browser(url().default("https://voidbase.cloud"), "the main site"),
  PB_DISCORD_URL: browser(url().default("https://discord.gg/zYujFvVYgq"), "the Discord invite"),
});
