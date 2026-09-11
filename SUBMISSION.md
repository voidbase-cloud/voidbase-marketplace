# Submitting

A submission is a GitHub issue. A maintainer runs the checks below on it and posts what they found, reads that and
decides. Nothing is listed automatically and nothing is rejected automatically.

## A template

1. Make the repository public, give it a licence GitHub can identify, and write a README that says what someone gets
   from starting with it.
2. Turn on **Template repository** in the repository settings, so *Use this template* works. This is how anyone
   listed here is actually used.
3. Open the [template submission form](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-template.yml).
4. A maintainer runs the audit (`bun run submission:validate -- --issue <n> --post`), and a comment appears with
   what it found. If something is wrong, edit the issue and ask for another run.
5. A maintainer approves it (`bun run submission:approve -- --issue <n>`), which commits the listing to
   `registry/templates.json`, pushes it and closes the issue.

## A plugin

A plugin is a repository with a `plugin.json` in its root (the manifest voidbase's loader reads: name, version, tier,
the voidbase range, the interfaces it provides and requires) and an entry point (`exports["."]` in package.json, or
`src/index.ts`) whose default export is the plugin. You do not build or publish anything. Read this before spending
time on it: a listing with a release is installable with `voidbase plugins add <name>` (voidbase 0.9.0-beta.7 or
later) into an executable, a local instance, a project or a stack app, and from its page into a cloud instance.

1. Make the repository public, give it a licence GitHub can identify, and write a README.
2. Open the [plugin submission form](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-plugin.yml).
3. A maintainer approves it (`bun run submission:approve -- --issue <n>`), which lists it in `registry/plugins.json`
   and runs the pipeline: the repository at its current commit is audited, bundled, audited again, hashed and
   written under `registry/v1/`, pushed, and served from `/registry/v1/`. What every check found is recorded with
   the version, so you can read it and disagree.
4. A new version is a new commit of your repository and a maintainer's `bun run plugin:bundle <owner/name> [ref]`
   against it, pushed; a published version never changes. Open an issue to ask for one.

## A theme

A theme is a repository with a `theme.json` in its root, a `pb_public` overlay (files copied over an instance's
static files) and the SCSS or CSS a stack app imports. Read this before spending time on it: **a theme is copied, not
installed.** `voidbase plugins add` installs plugins, there is no `voidbase themes add` in the package, and this
marketplace will not pretend there is. What a listing gets you is the audit, a version that never changes, every file
served with its own hash, and a line on the listing saying what to copy where.

```json
{
  "name": "midnight",
  "title": "Midnight",
  "summary": "A dark theme for the panel and for a stack app's pages.",
  "version": "1.0.0",
  "licence": "MIT",
  "author": "you",
  "homepage": "https://example.com/midnight",
  "carries": { "public": "pb_public", "styles": ["styles/midnight.scss"] }
}
```

`name` is lowercase letters, digits and dashes, and is what the theme is served under. `version` is `1.2.3` (or
`1.2.3-beta.1`), and a published version never changes: a change is a new version. `carries.public` is the directory
copied over an instance's `pb_public`, and it defaults to `pb_public`; `carries.styles` are the stylesheets a stack
app imports, which is where your variables live. Nothing outside those paths is published, and `licence` may be
spelled `license` if you must.

1. Make the repository public, give it a licence GitHub can identify, and write a README.
2. Open the [theme submission form](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-theme.yml).
3. The audit runs on the issue and comments with what it found: the repository, the manifest, and whether the paths
   it declares are there. Fix anything it flags by editing the issue, which runs it again.
4. A maintainer approves it (`bun run submission:approve -- --issue <n>`), which lists it in `registry/themes.json`
   and runs the pipeline: the files themselves are audited, each one is hashed, they are copied under
   `registry/v1/themes/<name>/<version>/`, and what every check found is recorded with the version.
5. A new version is a new tag on your repository. The daily check finds it and publishes it; a maintainer can also
   run `bun run theme:publish <owner/name> [ref]` by hand.

## What the audit checks

All of it is deterministic, all of it is reported with the reason, and all of it is visible on the listing so you can
disagree with any single check by reading it.

| Check | What it means |
| --- | --- |
| public repository | It exists and is reachable without signing in. **Blocking.** |
| not archived | An archived repository stops getting fixes. **Blocking.** |
| has a licence | GitHub can identify a licence. A `LICENSE` file it does not recognise counts as none. |
| has a commit to point at | The default branch is readable, and its tip is recorded with the listing. **Blocking.** |
| looks like a voidbase project | One of `void.json`, `vb_hooks`, `vb_migrations`, `pb_hooks`, `pb_migrations`, `vb_secrets` or `pb_secrets` is in the root. **Blocking.** |
| has a README | There is something to read before cloning it. |
| nothing obviously alarming | The files we read contain no shell-piped downloads, `eval`, process spawning or anything shaped like a credential. |

A theme is a different kind of repository, so it is checked against what a theme is. The first pass on the issue
reads the repository (public, not archived, a licence, a commit, a `theme.json` that is valid, and the paths it
declares present in the root). The rest runs when the version is published, over the whole checkout, and all of it is
blocking, because the files are what is served:

| Check | What it means |
| --- | --- |
| carries what it declares, and only that | Every path in `carries` is there, nothing published is outside them, and nothing is a symbolic link. |
| no JavaScript in what it carries | No script file, no `<script>` tag, no inline event handler. An overlay is copied over an instance's static files: if it ships code it is a plugin, and plugins are audited as plugins. |
| only the kinds of file a theme is made of | Stylesheets, pages, images and fonts (`css`, `scss`, `sass`, `html`, `svg`, `json`, `md`, `txt`, and the usual image and font extensions). |
| is small enough to serve from a repository | 512 KB in one file, 2 MB in total. The registry is a git repository somebody has to review. |

Blocking means it cannot be listed as it stands. The rest is for a maintainer to weigh, which is why a missing
licence is reported rather than fatal: an unlicensed repository is a real problem, and whether it is *your* problem
is not ours to decide.

### What it does not do

It does not run the code. It reads a handful of files at one commit on one day, and the repository can change the
minute after. It cannot tell you a template is safe, only that nothing it knows to look for was there. **Read
anything before you run it.**

There is no model in the blocking path. If an advisory summary is ever added it will be labelled as advisory
wherever it appears and will not be able to fail a submission on its own, because a marketplace that rejects people
on a model's opinion without a reason they can read is worse than one with no checks at all.

## Removal

A listing can be removed if the repository disappears, becomes something other than what was listed, or turns out to
be someone else's work. Open an issue. Instances that installed a removed plugin keep what they have, and a project
that copied a removed theme keeps those files; neither can be fetched from here again.
