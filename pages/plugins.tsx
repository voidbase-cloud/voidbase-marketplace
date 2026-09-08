import { Card, Empty } from "@/components/Listing";
import { LISTINGS, SUBMIT } from "@/lib/listings";

export default function Plugins() {
  const entries = LISTINGS.plugin;
  return (
    <div className="listing">
      <h1>Plugins</h1>
      <p className="lead">
        Nothing here can be installed. <code>pb_plugins</code> is on{" "}
        <a href="https://voidbase.cloud/docs/roadmap" target="_blank" rel="noreferrer noopener">the roadmap</a> and has
        no format yet, so these are registrations rather than releases: what people would write, recorded while the
        loader is being designed, so it gets designed around them.
      </p>
      {entries.length ? (
        <div className="cards">{entries.map((e) => <Card key={e.repository} entry={e} kind="plugin" />)}</div>
      ) : (
        <Empty what="Register one anyway. Saying what you would build is how the format gets shaped." href={SUBMIT.plugin} />
      )}
    </div>
  );
}
