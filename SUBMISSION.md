# Submitting

A submission is a GitHub issue. Opening one runs the checks below and posts what they found; a maintainer reads that
and decides. Nothing is listed automatically and nothing is rejected automatically.

## A template

1. Make the repository public, give it a licence GitHub can identify, and write a README that says what someone gets
   from starting with it.
2. Turn on **Template repository** in the repository settings, so *Use this template* works. This is how anyone
   listed here is actually used.
3. Open the [template submission form](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-template.yml).
4. Within a minute or two a comment appears with the audit. If something is wrong, edit the issue: that runs it
   again.
5. A maintainer labels it `approved`, which commits the listing to `registry/templates.json` and closes the issue.

## A plugin

A plugin is a repository with a `plugin.json` in its root (the manifest voidbase's loader reads: name, version, tier,
the voidbase range, the interfaces it provides and requires) and an entry point (`exports["."]` in package.json, or
`src/index.ts`) whose default export is the plugin. You do not build or publish anything. Read this before spending
time on it: a listing with a release is installable with `voidbase plugins add <name>` (voidbase 0.9.0-beta.7 or
later) into an executable, a local instance or a project; stack apps and cloud instances cannot install yet.

1. Make the repository public, give it a licence GitHub can identify, and write a README.
2. Open the [plugin submission form](https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-plugin.yml).
3. A maintainer labels it `approved`, which lists it in `registry/plugins.json` and runs the pipeline: the repository
   at its current commit is audited, bundled, audited again, hashed and written under `registry/v1/`, and served
   from `/registry/v1/`. What every check found is recorded with the version, so you can read it and disagree.
4. A new version is a new commit and a run of the `bundle` workflow against it; a published version never changes.

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
be someone else's work. Open an issue.
