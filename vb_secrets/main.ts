// The marketplace's configuration, declared once, each key stating who may read it. The same four tiers voidbase
// uses everywhere: secret() for the Worker's encrypted secrets, server() for plain Worker vars, browser() for what
// is inlined into the static site, local() for tooling that never leaves this machine or CI.
//
// The listing itself needs none of these. Everything here is either the deploy target or the optional audit.
import { browser, defineSecrets, local, secret, string, url } from "@voidbase-cloud/voidbase/secrets";

export default defineSecrets({
  // ---- local: the deploy itself
  VOIDBASE_DEPLOY_CF_API_KEY: local(string().optional(), "the deploy token (`voidbase token` prints the link that creates it)"),
  VOIDBASE_DEPLOY_NAME: local(string().default("voidbase-marketplace"), "the Worker this project deploys to"),
  VOIDBASE_DEPLOY_DOMAIN: local(string().default("marketplace.voidbase.cloud"), "its hostname"),
  CLOUDFLARE_BUILDS_TOKEN: local(string().optional(), "a user API token with Workers Builds Configuration: Edit, for `voidbase sync`"),

  // ---- secret: the superuser the admin panel is reached with
  VOIDBASE_SUPERUSER_EMAIL: secret(string().optional(), "the admin panel superuser"),
  VOIDBASE_SUPERUSER_PASSWORD: secret(string().optional(), "its password"),

  // ---- browser: what the listing pages are allowed to know
  PB_REPO_URL: browser(url().default("https://github.com/voidbase-cloud/voidbase-marketplace"), "this repository, which is where submissions happen"),
  PB_SITE_URL: browser(url().default("https://voidbase.cloud"), "the main site"),
  PB_DISCORD_URL: browser(url().default("https://discord.gg/zYujFvVYgq"), "the Discord invite"),
});
