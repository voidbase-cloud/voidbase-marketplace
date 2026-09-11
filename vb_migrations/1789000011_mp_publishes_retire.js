/// <reference path="../.voidbase/pb_data/types.d.ts" />
// A listing can leave: the publish queue's kind gains "retire".
migrate((app) => {
  const c = app.findCollectionByNameOrId("mp_publishes");
  const kind = c.fields.getByName("kind"); if (kind && !kind.values.includes("retire")) kind.values = [...kind.values, "retire"];
  app.save(c);
  return null;
}, (app) => {
  const c = app.findCollectionByNameOrId("mp_publishes");
  const kind = c.fields.getByName("kind"); if (kind) kind.values = kind.values.filter((v) => v !== "retire");
  app.save(c);
  return null;
});
