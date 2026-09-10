/// <reference path="../.voidbase/pb_data/types.d.ts" />
// The publish queue: one row per thing the pipeline has to make real (a submission to list, a version to serve, a
// submission to validate), claimed by the `(publish)` build, reported back when done. Superusers only: no API rules.
migrate((app) => {
  const text = (name) => ({ type: "text", name, required: false, hidden: false, presentable: false, system: false, primaryKey: false, autogeneratePattern: "", pattern: "", min: 0, max: 0 });
  const select = (name, values) => ({ type: "select", name, required: true, hidden: false, presentable: false, system: false, maxSelect: 1, values });
  const id = { type: "text", name: "id", required: true, primaryKey: true, system: true, hidden: false, presentable: false, autogeneratePattern: "[a-z0-9]{15}", min: 15, max: 15, pattern: "^[a-z0-9]+$" };
  const autodates = [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false, hidden: false, presentable: false, system: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true, hidden: false, presentable: false, system: false },
  ];
  app.importCollections([{
    name: "mp_publishes", type: "base", system: false,
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    indexes: ["CREATE INDEX `idx_mp_publishes_status` ON `mp_publishes` (`status`)"],
    fields: [id, { ...text("repository"), presentable: true }, text("ref"), { type: "number", name: "issue", required: false, hidden: false, presentable: false, system: false, onlyInt: true, min: null, max: null },
      select("kind", ["publish", "validate"]), select("status", ["queued", "building", "done", "failed"]),
      text("reason"), text("version"), text("commit"), text("error"), text("run"), text("build"), ...autodates],
  }], false);
  return null;
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("mp_publishes")); } catch (_) { /* already gone */ }
  return null;
});
