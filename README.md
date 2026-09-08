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

**You cannot install a plugin.** `pb_plugins` does not exist. There is no manifest format, no loader, and nothing to
install into. Plugin submissions are open anyway, because the loader is being designed and what people actually want
to build should shape it rather than the other way round. A plugin listing here is a registration, not a release.

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

## Credit

The submission-by-issue model, the audit-before-listing order and the shape of the registry are taken from
[omarchy-plugin-marketplace](https://github.com/omacom/omarchy-plugin-marketplace), which worked out how to run a
community marketplace without accounts or uploads. This is a much smaller version of the same idea.

## Licence

[MIT](LICENSE). Listed repositories are their authors' own, under whatever licence they chose.
