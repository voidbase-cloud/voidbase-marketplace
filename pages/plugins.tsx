import { Card, Empty } from "@/components/Listing";
import { LISTINGS, SUBMIT } from "@/lib/listings";

export default function Plugins() {
  const entries = LISTINGS.plugin;
  return (
    <div className="listing">
      <h1>Plugins</h1>
      <p className="lead">
        Each plugin listed here is built by this marketplace from its repository at a commit, audited before and after
        the build, hashed, and served under <code>/registry/v1/</code> the way{" "}
        <a href="https://github.com/voidbase-cloud/voidbase/blob/master/docs/registry.md" target="_blank" rel="noreferrer noopener">the registry protocol</a>{" "}
        says, which any marketplace can serve and any instance can read. Nothing can install one yet:{" "}
        <code>pb_plugins</code> is on{" "}
        <a href="https://voidbase.cloud/docs/roadmap" target="_blank" rel="noreferrer noopener">the roadmap</a>, so a
        release here is what an instance will install once it can, and a listing without one is a registration.
      </p>
      {entries.length ? (
        <div className="cards">{entries.map((e) => <Card key={e.repository} entry={e} kind="plugin" />)}</div>
      ) : (
        <Empty what="Register one anyway. Saying what you would build is how the format gets shaped." href={SUBMIT.plugin} />
      )}
    </div>
  );
}
