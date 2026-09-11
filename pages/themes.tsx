// Themes, and the one thing a reader has to be told before the cards: nothing installs a theme. voidbase has
// `plugins add`; it has no `themes add`. So the page says what a theme is made of, where its files are served, and
// the command that copies them, rather than implying a mechanism that does not exist.
import { Card, Empty } from "@/components/Listing";
import { LISTINGS, SUBMIT } from "@/lib/listings";

export default function Themes() {
  const entries = LISTINGS.theme;
  return (
    <div className="listing">
      <h1>Themes</h1>
      <p className="lead">
        A theme is a repository with a <code>theme.json</code>, a <code>pb_public</code> overlay (files copied over an
        instance's static files) and the SCSS or CSS a stack app imports. The marketplace audits what those files are,
        hashes each one and serves them under <code>/registry/v1/themes/</code>, beside the plugins and the templates.
      </p>
      <p className="lead">
        <strong>You copy a theme, you do not install it.</strong> <code>voidbase plugins add</code> installs plugins,
        and there is no <code>voidbase themes add</code> in the package yet. The version record lists every file it
        carries with its size and its hash, and each one is served at{" "}
        <code>/registry/v1/themes/&lt;name&gt;/&lt;version&gt;/&lt;path&gt;</code>, so this fetches exactly the bytes
        that were audited:
      </p>
      <pre className="copy-theme"><code>{`base=https://marketplace.voidbase.cloud/registry/v1/themes/<name>/<version>
curl -fsS "$base.json" | jq -r '.files[].path' | while read -r p; do
  mkdir -p "$(dirname "$p")" && curl -fsS "$base/$p" -o "$p"
done`}</code></pre>
      <p className="lead">
        That writes the theme's own layout into the current directory. Copy its overlay over your{" "}
        <code>pb_public/</code>, and import its stylesheet from your app. Nothing is pinned and nothing is verified for
        you afterwards: the hashes are in the record, and checking them is yours to do until the package has a command
        that does it.
      </p>
      {entries.length ? (
        <div className="cards">{entries.map((e) => <Card key={e.repository} entry={e} kind="theme" />)}</div>
      ) : (
        <Empty what="A theme is a pb_public overlay and the variables a stack app imports, in a public repository with a theme.json." href={SUBMIT.theme} />
      )}
    </div>
  );
}
