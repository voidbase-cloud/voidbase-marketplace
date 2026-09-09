# voidbase marketplace

Templates and plugins for [voidbase](https://voidbase.cloud), listed at
[marketplace.voidbase.cloud](https://marketplace.voidbase.cloud).

Your code stays in your repository. A listing points at it and records what our checks found on the day it was
added. For a plugin the marketplace also builds a bundle from the repository at that commit, audits it on both sides
of the build, hashes it and serves it, because that is the marketplace's job and not the contributor's.

- **[Submit a template](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-template.yml)**
- **[Submit a plugin](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-plugin.yml)**
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

**There are no accounts, downloads or rankings.** Nothing to sign in to and nothing counted. If creators are ever
able to charge for what they publish, it will be written down on
[the pricing page](https://voidbase.cloud/docs/pricing) before it is built.

## The registry is a file

`registry/templates.json` and `registry/plugins.json` are the listings, and `registry/v1/` is what is served: the index,
one record per plugin version, and the bundle beside it, all written by the pipeline and committed. Together they are
the whole database. A listing arrives as a commit, which
means it can be read, reviewed, reverted and argued with, and the site is prerendered from those files at build
time.

## The registry protocol

Three GETs, defined in voidbase ([docs/registry.md](https://github.com/voidbase-cloud/voidbase/blob/master/docs/registry.md))
because voidbase is the consumer and the spec is what keeps this marketplace unprivileged:

| | |
| --- | --- |
| `GET /registry/v1/index.json` | everything served: plugins with every version, and templates |
| `GET /registry/v1/plugins/<name>/<version>.json` | one version: manifest, integrity, source commit, audit |
| `GET /registry/v1/plugins/<name>/<version>/bundle.js` | the bundle, one ES module whose default export is the plugin |

The pipeline is `bun scripts/bundle.ts <owner/name> [ref]`: audit the source (public, licence, `plugin.json` valid
against voidbase's `checkManifest`, interfaces voidbase defines, an entry point, nothing alarming), install its
dependencies without running their scripts, bundle with Bun (what an instance provides stays an import: voidbase's
entry points and hono; everything else is inlined), audit the bundle (imports only what an instance provides, a
default export, size, nothing alarming), hash it, write the record and regenerate the index. A version is immutable;
a change is a new version. It runs on approval and from the `bundle` workflow by hand.

## Working on it

```bash
bun install
bun run dev              # the site
bun run registry:check   # the listings are valid, the index is fresh and readable by an instance, every bundle matches its record
bun run plugin:bundle <owner/name> [ref]   # build, audit and publish a plugin version (needs GH_TOKEN)
bun run check            # typecheck
bun run build            # production build, prerendered into .voidbase/pb_public
```

It is a [voidbase stack app](https://voidbase.cloud/docs/run/stack): pages, the API and the instance build into one
Worker. The instance holds nothing yet, because the registry is in git; it is here for what comes after listing.

## Deploying

Cloudflare Workers Builds calls `bun run build`, `bun run deploy` and `bun run version` with the root directory
set to `/`. Two settings have to exist on the trigger, under **Settings > Build > Variables and secrets**, because
neither can live in this repository:

| | | |
| --- | --- | --- |
| `BUN_VERSION` | variable | `1.3.14` or later. Cloudflare's default Bun reports itself as Node 22.6, and Vite needs 22.12. There is no file that pins Bun, only this variable. |
| `VOIDBASE_DEPLOY_CF_API_KEY` | secret | The deploy token. `voidbase token` prints the dashboard link that creates one with the right permissions. |

Everything else the deploy needs is declared in `vb_secrets/main.ts` with defaults, including the Worker name and
`marketplace.voidbase.cloud`.

## Credit

The submission-by-issue model, the audit-before-listing order and the shape of the registry are taken from
[omarchy-plugin-marketplace](https://github.com/omacom/omarchy-plugin-marketplace), which worked out how to run a
community marketplace without accounts or uploads. This is a much smaller version of the same idea.

## Licence

[MIT](LICENSE). Listed repositories are their authors' own, under whatever licence they chose.
