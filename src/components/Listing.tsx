// One card in the listing, and the empty state that stands in for it.
//
// Every card says the same three things: what it is, who submitted it, and what you can do with it right now. The
// last one is short on purpose. A template can be started from on GitHub; a plugin with a release is one command away,
// and pretending otherwise with a disabled Install button would be worse than saying so.
import type { Entry } from "@/lib/registry";
import { RELEASES, registryUrl, repoUrl, useTemplateUrl } from "@/lib/listings";

export function Card({ entry, kind }: { entry: Entry; kind: "template" | "plugin" }) {
  const audit = entry.audit;
  const failed = audit?.checks.filter((c) => !c.passed) ?? [];
  const release = kind === "plugin" ? RELEASES.get(entry.repository) : undefined;
  const latest = release?.versions.find((v) => v.version === release.latest);
  return (
    <article className="card">
      <header>
        <h3><a href={repoUrl(entry.repository)} target="_blank" rel="noreferrer noopener">{entry.title}</a></h3>
        <span className="cat">{entry.category}</span>
      </header>
      <p className="summary">{entry.summary}</p>
      <ul className="tags">{entry.tags.map((t) => <li key={t}>{t}</li>)}</ul>
      <footer>
        <span className="repo">{entry.repository}</span>
        {kind === "template" ? (
          <a className="btn" href={useTemplateUrl(entry.repository)} target="_blank" rel="noreferrer noopener">
            Use this template
          </a>
        ) : release && latest ? (
          <span className="release">
            <a href={registryUrl(latest.bundle)} title={latest.integrity}>bundle {release.latest}</a>
            {" · "}{latest.bytes} bytes{" · "}
            <a href={registryUrl(`plugins/${release.name}/${release.latest}.json`)}>record</a>
            {" · "}<code className="install" title="voidbase 0.9.0-beta.7 or later">voidbase plugins add {release.name}</code>
          </span>
        ) : (
          <span className="not-yet" title="pb_plugins does not exist yet">Registered, no release yet</span>
        )}
      </footer>
      {audit && (
        <details className="audit">
          <summary>
            Audit: {audit.checks.length - failed.length} of {audit.checks.length} checks passed
            {entry.commit ? ` at ${entry.commit.slice(0, 7)}` : ""}
          </summary>
          <ul>
            {audit.checks.map((c) => (
              <li key={c.name} className={c.passed ? "ok" : "no"}>
                <strong>{c.name}</strong> {c.detail}
              </li>
            ))}
          </ul>
          <p className="fineprint">
            A first pass, not a guarantee. It ran once, against the commit named above, and the repository can have
            changed since. Read the code before you run it.
          </p>
        </details>
      )}
    </article>
  );
}

export function Empty({ what, href }: { what: string; href: string }) {
  return (
    <div className="empty">
      <p>Nothing listed yet. {what}</p>
      <a className="btn" href={href} target="_blank" rel="noreferrer noopener">Be the first</a>
    </div>
  );
}
