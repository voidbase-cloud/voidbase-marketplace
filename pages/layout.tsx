// The chrome around every page: a header that says what this is and where it sits, and a footer that says what it
// is not yet, because a marketplace where nothing can be installed should say so on every page rather than once.
import type { ReactNode } from "react";
import { Link } from "@void/react";
import "@/scss/main.scss";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="beta">
        <span className="mark">early</span>
        <span>
          You can list something and you can start from a template. Installing a plugin is not built yet, and the
          plugin format does not exist.
        </span>
      </div>

      <header className="site-header">
        <Link href="/" className="brand">void<strong>base</strong> <span>marketplace</span></Link>
        <nav>
          <Link href="/templates">Templates</Link>
          <Link href="/plugins">Plugins</Link>
          <Link href="/themes">Themes</Link>
          <Link href="/submit">Submit</Link>
          <a href="https://voidbase.cloud/docs" target="_blank" rel="noreferrer noopener">Docs</a>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <p>
          Listings point at repositories their authors own. Being listed is not an endorsement and the audit is a
          first pass rather than a guarantee, so read the code before you run it.
        </p>
        <p className="links">
          <a href="https://voidbase.cloud" target="_blank" rel="noreferrer noopener">voidbase.cloud</a>
          <a href="https://github.com/voidbase-cloud/voidbase-marketplace" target="_blank" rel="noreferrer noopener">This repository</a>
          <a href="https://discord.gg/zYujFvVYgq" target="_blank" rel="noreferrer noopener">Discord</a>
          <a href="https://voidbase.cloud/docs/roadmap" target="_blank" rel="noreferrer noopener">Roadmap</a>
        </p>
      </footer>
    </>
  );
}
