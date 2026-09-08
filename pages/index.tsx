// The front page. It has one job while the marketplace is nearly empty: say what this is, say plainly what it
// cannot do yet, and make submitting something the obvious next click.
import { Link } from "@void/react";
import { LISTINGS, SUBMIT } from "@/lib/listings";

export default function Home() {
  const templates = LISTINGS.template.length;
  const plugins = LISTINGS.plugin.length;
  return (
    <div className="home">
      <section className="hero">
        <h1>Templates and plugins for voidbase</h1>
        <p className="lead">
          Written by the people who use it, listed here, hosted in their own repositories. Submitting one is a GitHub
          issue, and the registry behind this page is a file in a public repository you can read and argue with.
        </p>
        <div className="actions">
          <a className="btn primary" href={SUBMIT.template} target="_blank" rel="noreferrer noopener">Submit a template</a>
          <Link className="btn" href="/templates">Browse {templates || "the"} template{templates === 1 ? "" : "s"}</Link>
        </div>
      </section>

      <section className="honest">
        <h2>What works today, and what does not</h2>
        <dl>
          <dt>You can list a template</dt>
          <dd>
            Open an issue, an automated audit reads the repository and reports what it found, and a maintainer
            decides. Accepted templates appear here with that report attached.
          </dd>
          <dt>You can start from a listed template</dt>
          <dd>
            Through GitHub's own <strong>Use this template</strong> button, which clones it into your account. That is
            the whole mechanism, and it is somebody else's.
          </dd>
          <dt>You cannot install a plugin</dt>
          <dd>
            <code>pb_plugins</code> does not exist. There is no format, no loader, and nothing to install into.
            Plugin submissions are open regardless, because what people want to build should shape the format rather
            than the other way round. {plugins ? `${plugins} registered so far.` : "None registered yet."}
          </dd>
          <dt>There is no account, and nothing to pay</dt>
          <dd>
            No sign-in, no downloads counted, no ranking. When creators can charge for what they publish it will be
            written down on <a href="https://voidbase.cloud/docs/pricing" target="_blank" rel="noreferrer noopener">the pricing page</a> before it is built.
          </dd>
        </dl>
      </section>
    </div>
  );
}
