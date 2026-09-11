# voidbase marketplace

Templates, plugins and themes for [voidbase](https://voidbase.cloud), listed at
[marketplace.voidbase.cloud](https://marketplace.voidbase.cloud).

Your code stays in your repository. A listing points at it and records what our checks found on the day it was
added. For a plugin the marketplace also builds a bundle from the repository at that commit, audits it on both sides
of the build, hashes it and serves it, because that is the marketplace's job and not the contributor's. For a theme
there is nothing to build, so it audits the files themselves, hashes each one and serves them at their own paths.

- **[Submit a template](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-template.yml)**
- **[Submit a plugin](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-plugin.yml)**
- **[Submit a theme](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-theme.yml)**
- [How submission works](SUBMISSION.md)

## What works today, and what does not

This is early, and the useful thing to say about an early marketplace is what it cannot do.

**You can list a template, and you can start from one.** Starting is GitHub's own *Use this template* button, which
clones the repository into your account. That is the entire install mechanism and it is somebody else's.

**You can install a plugin** (voidbase 0.9.0-beta.7 or later): `voidbase plugins add <name>` downloads the release this
marketplace serves into the project's `pb_plugins/<name>`, verifies it against the hash recorded here, and pins it in
`voidbase.lock`; the instance verifies the bytes again every time it starts. A listed plugin is built here from its
repository at a commit, audited, hashed and served under `/registry/v1/` as [the registry protocol](https://github.com/voidbase-cloud/voidbase/blob/master/docs/registry.md)
says, which any marketplace can serve and any instance can read: an instance is not tied to this one, and
`--marketplace <url>` installs from another. A cloud instance installs from its page on voidbase.cloud, through a
build the page shows.

**You can copy a theme, and you cannot install one.** A theme is a public repository with a `theme.json`, a
`pb_public` overlay (files copied over an instance's static files) and the SCSS or CSS a stack app imports. voidbase
has `voidbase plugins add`; it has no `voidbase themes add`, and nothing here pretends otherwise. What the
marketplace does is audit what the files are, hash each one and serve them under `/registry/v1/themes/`, so what you
copy is the bytes that were audited rather than whatever the repository holds today:

```bash
base=https://marketplace.voidbase.cloud/registry/v1/themes/<name>/<version>
curl -fsS "$base.json" | jq -r '.files[].path' | while read -r p; do
  mkdir -p "$(dirname "$p")" && curl -fsS "$base/$p" -o "$p"
done
```

That writes the theme's own layout into the current directory. Copy its overlay over your `pb_public/`, import its
stylesheet from your app, and check the hashes in the record if you want them checked: nothing is pinned and nothing
is verified for you, because there is no client for this yet.

**There are no accounts, downloads or rankings.** Nothing to sign in to and nothing counted. If creators are ever
able to charge for what they publish, it will be written down on
[the pricing page](https://voidbase.cloud/docs/pricing) before it is built.

## The registry is a file

`registry/templates.json`, `registry/plugins.json` and `registry/themes.json` are the listings, and `registry/v1/` is
what is served: the index, one record per plugin version with the bundle beside it, one record per theme version with
its files beside it, all written by the pipeline and committed. Together they are the whole database. A listing
arrives as a commit, which means it can be read, reviewed, reverted and argued with, and the site is prerendered from
those files at build time.

## The registry protocol

Three GETs, defined in voidbase ([docs/registry.md](https://github.com/voidbase-cloud/voidbase/blob/master/docs/registry.md))
because voidbase is the consumer and the spec is what keeps this marketplace unprivileged:

| | |
| --- | --- |
| `GET /registry/v1/index.json` | everything served: plugins with every version, themes with every version, and templates |
| `GET /registry/v1/plugins/<name>/<version>.json` | one version: manifest, integrity, source commit, the files it was built from, audit |
| `GET /registry/v1/plugins/<name>/<version>/bundle.js` | the bundle, one ES module whose default export is the plugin |

and three this marketplace adds, shaped so that a client which only knows the three above is unaffected by them:

| | |
| --- | --- |
| `GET /registry/v1/plugins/<name>/diff?from=<version>` | what changed between the version an instance has and the newest (`&to=` for another): files added, removed and changed, what the manifest now asks for, both audits' verdicts |
| `GET /registry/v1/themes/<name>/<version>.json` | one theme version: the manifest, every file it carries with its size and hash, source commit, audit |
| `GET /registry/v1/themes/<name>/<version>/<path>` | one file of a theme, at the path it has in its repository |

**An older client reads the new index unchanged.** `themes` is a key beside `plugins` and `templates`, and `kind`
(`"plugin"`, `"theme"`, `"template"`) is a field on every listing; voidbase's `problemsWithIndex` validates the keys
it knows and says nothing about the rest, and `voidbase plugins add <name>` looks in `plugins` alone, so it cannot
see a theme and cannot trip over one. `bun run registry:check` proves it on every change by validating the generated
index with voidbase's own validator rather than a copy of it. A plugin version record gained a `files` list (the
source at the commit it was built from, by path and size) for the same reason: a field a client ignores.

The diff is the only part of the registry a server answers rather than a file, which costs it two addresses. On
Cloudflare a voidbase instance is asset-first: the asset layer answers every path outside `/api` and the Worker is
never invoked for one (voidbase, docs/platform.md), so `public/_redirects` carries the address above to
`/api/registry/v1/plugins/<name>/diff`, which runs the same handler, the way the seo plugin carries `/robots.txt` to
`/api/seo/robots.txt`. On Bun the Worker sees every path and reads no `_redirects`, so the handler is registered at
both. Use the `/registry/v1` address and follow the redirect.

It answers one status for every refusal, 400, with the reason in the message. A missing plugin wants to be a 404 and
cannot be one here: under `/registry/v1` a 404 is the asset layer's word for "no such file", and a Bun instance turns
any 404 outside `/api` into the site's own HTML, so a question would be answered with a page. A release published
before the pipeline recorded a file list answers `"files": "unknown"` on that side, with the reason in `unknown`,
rather than reporting that nothing changed.

The pipeline is `bun scripts/bundle.ts <owner/name> [ref]`: audit the source (public, licence, `plugin.json` valid
against voidbase's `checkManifest`, interfaces voidbase defines, an entry point, nothing alarming), install its
dependencies without running their scripts, bundle with Bun (what an instance provides stays an import: voidbase's
entry points and hono; everything else is inlined), audit the bundle (imports only what an instance provides, a
default export, size, nothing alarming), hash it, write the record and regenerate the index. A version is immutable;
a change is a new version. The approval command runs it, and a maintainer runs it by hand for a new version.

A theme goes through `bun scripts/theme.ts <owner/name> [ref]` instead, and it is not the plugin pipeline with the
build taken out: there is nothing to install dependencies for, nothing to bundle and nothing an instance evaluates,
so what is left is what the files *are*. It audits the source (public, licence, a valid `theme.json`), reads the
checkout, and refuses JavaScript anywhere in the overlay (a script file, a `<script>` tag, an inline event handler),
a file outside the directories `carries` declares, a symbolic link, anything that is not a stylesheet, a page, an
image or a font, more than 512 KB in one file and more than 2 MB in total. Then it hashes every file, copies each one
to `registry/v1/themes/<name>/<version>/<path>`, and records them. The version's own `integrity` is the SHA-256 of
its file list (`<integrity>  <path>` a line, in path order, the way a checksum file is written), because a theme is
many files and no single one of them is the release.

## Working on it

```bash
bun install
bun run dev              # the site
bun run registry:check   # the listings are valid, the index is fresh and readable by an instance, every bundle matches its record
bun run plugin:bundle <owner/name> [ref]   # build, audit and publish a plugin version (needs GH_TOKEN); commit and push it
bun run theme:publish <owner/name> [ref]   # audit, hash and publish a theme version (needs GH_TOKEN); commit and push it
bun run check            # typecheck
bun run build            # production build, prerendered into .voidbase/pb_public
```

Submissions are GitHub issues, and the marketplace handles them itself. The repository's webhook sends `issues`
events to `/api/marketplace/github/webhook`: a submission opened or edited is audited and answered with a comment;
one a maintainer labels `approved` is listed (a plugin is built, audited and hashed), committed, pushed, answered and
closed. The daily check (`crons/refresh.ts`, 06:00 UTC) asks every listed plugin's and theme's repository for its
tags and publishes the versions this marketplace does not serve yet; which pipeline a queued version goes through is
the listing's business, and the publish build reads `registry/themes.json` to know. Each of those is a row of
`mp_publishes`, a Cloudflare
Workflow (`workflows/publish.ts`) starts the `voidbase-marketplace (publish)` build through the Builds API and
watches it, and that build (`scripts/publish-build.ts`) claims the rows, runs the same scripts a maintainer would,
commits and pushes; the push deploys. Two Flagship flags hold the pipeline without a deploy: `MARKETPLACE_SUBMISSIONS`
(the webhook queues nothing while off) and `MARKETPLACE_AUTO_VERSIONS` (the daily check publishes nothing while off).
A listing leaves the same way: an issue titled `[remove] owner/name` (or labelled `remove`) is answered when
opened and, once a maintainer adds `approved`, retired: the entry leaves the listing, a plugin's or a theme's served
versions leave `registry/v1`, the index is regenerated, one commit, the issue closed (`scripts/retire.ts`). Instances
that installed a retired plugin keep what they have, and a project that copied a retired theme keeps those files. A
superuser can queue by hand, `POST /api/marketplace/publish` with `{ issue }`, `{ repository, ref }` or
`{ repository, kind: "retire" }`, and read the queue at `GET /api/marketplace/publish`; `bun test`
(`test/publish.ts`, 26 checks) is the pipeline against mocks: the Builds API, a GitHub of the test's own serving four
theme repositories as trees, files and tarballs, and this marketplace's own index.

By hand, from a machine with `gh` signed in, the scripts still work: `bun run submission:validate -- --issue <n>
--post`, `bun run submission:approve -- --issue <n>`, `bun run plugin:bundle <owner/name> [ref]`,
`bun run theme:publish <owner/name> [ref]`.

It is a [voidbase stack app](https://voidbase.cloud/docs/run/stack): pages, the API and the instance build into one
Worker. The instance holds nothing yet, because the registry is in git; it is here for what comes after listing.

## Deploying

Every push to master builds on Cloudflare Workers Builds through the repository's connection and syncs the
instance: `bun run build` (Vite, into `.voidbase/`) and then `bun run deploy` (`voidbase sync`), root directory
`/`, and nothing else. No checks run in the pipeline; `bun run registry:check` and `bun run check` are for a
machine, and the approval command runs the registry check before it commits. Two settings have to exist on the
trigger, under **Settings > Build > Variables and secrets**, because neither can live in this repository:

| | | |
| --- | --- | --- |
| `BUN_VERSION` | variable | `1.3.14` or later. Cloudflare's default Bun reports itself as Node 22.6, and Vite needs 22.12. There is no file that pins Bun, only this variable. |
| `VOIDBASE_DEPLOY_CF_API_KEY` | secret | The deploy token. `voidbase token` prints the dashboard link that creates one with the right permissions. |

Everything else the deploy needs is declared in `vb_secrets/main.ts` with defaults, including the Worker name and
`marketplace.voidbase.cloud`. The secrets (the superuser, `MP_GH_TOKEN`, `MP_BUILDS_TOKEN`, `MP_WEBHOOK_SECRET`) live
in the account's Secrets Store (`VOIDBASE_SECRETS_STORE` on the trigger; `voidbase secrets push --dir vb_secrets`
from a checkout that has `vb_secrets/secrets.json`). The `(publish)` trigger is the Worker's second, never on push,
with `BUN_VERSION`, `MP_URL`, `MARKETPLACE_REPO`, `MP_BUILD_EMAIL`/`MP_BUILD_PASSWORD` (the superuser) and `GH_TOKEN`
(commits, issue comments) on it.

## Credit

The submission-by-issue model, the audit-before-listing order and the shape of the registry are taken from
[omarchy-plugin-marketplace](https://github.com/omacom/omarchy-plugin-marketplace), which worked out how to run a
community marketplace without accounts or uploads. This is a much smaller version of the same idea.

## Licence

[MIT](LICENSE). Listed repositories are their authors' own, under whatever licence they chose.
