# voidbase marketplace

Templates and plugins for [voidbase](https://voidbase.cloud), listed at
[marketplace.voidbase.cloud](https://marketplace.voidbase.cloud).

Your code stays in your repository. A listing points at it and records what our checks found on the day it was
added. Nothing here is copied, vendored or republished.

- **[Submit a template](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-template.yml)**
- **[Submit a plugin](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-plugin.yml)**
- [How submission works](SUBMISSION.md)

## What works today, and what does not

This is early, and the useful thing to say about an early marketplace is what it cannot do.

**You can list a template, and you can start from one.** Starting is GitHub's own *Use this template* button, which
clones the repository into your account. That is the entire install mechanism and it is somebody else's.

**You cannot install a plugin yet.** voidbase has a manifest format and a loader: the three plugins it ships (backups,
realtime and the request limits) arrive through them, and each is also a package under
[voidbase-cloud](https://github.com/orgs/voidbase-cloud/repositories?q=voidbase-plugin) on GitHub Packages. But
`pb_plugins` does not exist, so nothing listed here can be installed into an instance. Plugin submissions are open
anyway, because installing is being designed now and what people actually want to build should shape it rather than
the other way round. A plugin listing here is a registration, not a release.

**There are no accounts, downloads or rankings.** Nothing to sign in to and nothing counted. If creators are ever
able to charge for what they publish, it will be written down on
[the pricing page](https://voidbase.cloud/docs/pricing) before it is built.

## The registry is a file

`registry/templates.json` and `registry/plugins.json` are the whole database. A listing arrives as a commit, which
means it can be read, reviewed, reverted and argued with, and the site is prerendered from those files at build
time.

## Working on it

```bash
bun install
bun run dev              # the site
bun run registry:check   # the registry parses and every entry is valid
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
