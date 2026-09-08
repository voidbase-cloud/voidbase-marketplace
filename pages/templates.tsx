import { Card, Empty } from "@/components/Listing";
import { LISTINGS, SUBMIT } from "@/lib/listings";

export default function Templates() {
  const entries = LISTINGS.template;
  return (
    <div className="listing">
      <h1>Templates</h1>
      <p className="lead">
        Repositories you can start a voidbase project from. Each one is somebody's own work, in their own repository,
        under their own licence. The audit report on a card is what our checks found on the day it was listed.
      </p>
      {entries.length ? (
        <div className="cards">{entries.map((e) => <Card key={e.repository} entry={e} kind="template" />)}</div>
      ) : (
        <Empty what="A template is any public repository that a voidbase project could sensibly start from." href={SUBMIT.template} />
      )}
    </div>
  );
}
