// One card in the listing, and the empty state that stands in for it.
//
// Every card says the same three things: what it is, who submitted it, and what you can do with it right now. The
// last one is short on purpose. A template can be started from on GitHub; a plugin with a release is one command away,
// and pretending otherwise with a disabled Install button would be worse than saying so. A theme is the third case
// and the honest one to state: `voidbase plugins add` installs plugins, there is no `voidbase themes add`, so the
// card says what a theme's files are and that you copy them.
import type { Entry, Kind } from "@/lib/registry";
import { RELEASES, THEMES, registryUrl, repoUrl, useTemplateUrl } from "@/lib/listings";
import { carriedBy } from "@/lib/theme";

export function Card({ entry, kind }: { entry: Entry; kind: Kind }) {
  const audit = entry.audit;
  const failed = audit?.checks.filter((c) => !c.passed) ?? [];
  const release = kind === "plugin" ? RELEASES.get(entry.repository) : undefined;
  const latest = release?.versions.find((v) => v.version === release.latest);
  const theme = kind === "theme" ? THEMES.get(entry.repository) : undefined;
  const themeLatest = theme?.versions.find((v) => v.version === theme.latest);
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
        ) : kind === "theme" ? (
          theme && themeLatest ? (
            <span className="release">
              <a href={registryUrl(`themes/${theme.name}/${theme.latest}.json`)} title={themeLatest.integrity}>record {theme.latest}</a>
              {" · "}{themeLatest.files.length} file{themeLatest.files.length === 1 ? "" : "s"}, {themeLatest.bytes} bytes
              {" · "}copy <code className="install">{carriedBy(themeLatest.manifest).public}/</code> over your <code className="install">pb_public/</code>
            </span>
          ) : (
            <span className="not-yet" title="listed, and not yet published as a version the marketplace serves">Registered, nothing served yet</span>
          )
        ) : release && latest ? (
          <span className="release">
            <a href={registryUrl(latest.bundle)} title={latest.integrity}>bundle {release.latest}</a>
            {" · "}{latest.bytes} bytes{" · "}
            <a href={registryUrl(`plugins/${release.name}/${release.latest}.json`)}>record</a>
            {" · "}<code className="install" title="voidbase 0.9.0-beta.7 or later">voidbase plugins add {release.name}</code>
          </span>
        ) : (
          <span className="not-yet" title="listed, and not yet built into a release the marketplace serves">Registered, no release yet</span>
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
