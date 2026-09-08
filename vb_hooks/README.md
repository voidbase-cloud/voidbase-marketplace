# vb_hooks

Handlers that run around record writes in this project's own voidbase instance, one per file, in TypeScript.

There are none yet, and that is the honest state of things: the registry is `registry/*.json` in this repository,
reviewed by a person and committed by a workflow, so nothing about a listing goes through the database. The instance
is here because this is a voidbase stack app and because what comes after listing (submissions that are not issues,
audit history, whatever engagement turns out to mean) will need it.

See https://voidbase.cloud/docs/run/stack/hooks.
