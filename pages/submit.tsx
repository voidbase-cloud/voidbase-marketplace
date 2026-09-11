// How to submit, on the site as well as in the repository, because most people will arrive here rather than there.
import { SUBMIT } from "@/lib/listings";

export default function Submit() {
  return (
    <div className="submit">
      <h1>Submit</h1>
      <p className="lead">
        A submission is a GitHub issue. Your code stays in your repository; a listing points at it and records what
        our checks found. Nothing is copied here and nothing is republished.
      </p>

      <section>
        <h2>A template</h2>
        <ol>
          <li>Make the repository public, give it a licence, and write a README that says what someone gets from it.</li>
          <li>Turn on <strong>Template repository</strong> in its settings, so Use this template works.</li>
          <li>
            Open the <a href={SUBMIT.template} target="_blank" rel="noreferrer noopener">template submission form</a>.
          </li>
          <li>
            An audit runs on the issue within a minute or two and comments with what it found: whether the repository
            is public and licensed, whether it looks like a voidbase project, whether anything in the files it read
            looked alarming. Fix anything it flags by editing the issue, which runs it again.
          </li>
          <li>A maintainer decides. If it is accepted, the listing is committed to the registry and appears here.</li>
        </ol>
      </section>

      <section>
        <h2>A plugin</h2>
        <p>
          Worth reading before you spend time on it: there is no plugin format yet, nothing here can be installed,
          and a listing does not make a plugin work. The form is open because the loader is being designed and what
          people want to build should shape it.
        </p>
        <p>
          <a href={SUBMIT.plugin} target="_blank" rel="noreferrer noopener">The plugin submission form</a> asks what
          your plugin would need from voidbase. That answer is the useful part.
        </p>
      </section>

      <section>
        <h2>A theme</h2>
        <p>
          A public repository with a <code>theme.json</code> in its root, a <code>pb_public</code> overlay and the
          SCSS or CSS a stack app imports. The audit is about what the files are: no JavaScript in the overlay,
          nothing outside the directories <code>carries</code> declares, stylesheets, pages, images and fonts only,
          512 KB a file and 2 MB in total. Every file of a published version is hashed and served.
        </p>
        <p>
          A theme is copied rather than installed. <code>voidbase plugins add</code> installs plugins, and there is no{" "}
          <code>voidbase themes add</code> yet, so what you get is the files, their hashes and a command that fetches
          them. <a href={SUBMIT.theme} target="_blank" rel="noreferrer noopener">The theme submission form</a> says
          the rest.
        </p>
      </section>

      <section>
        <h2>What we check, and what we do not</h2>
        <p>
          The checks are deterministic and they are listed in the audit report on every card, so you can disagree
          with any single one by reading it. They are a first pass. They do not prove a repository is safe, they do
          not run its code, and they look at one commit on one day. Read anything before you run it.
        </p>
        <p>
          Being listed is not an endorsement. A listing can be removed if the repository disappears, changes into
          something else, or turns out to be someone else's work.
        </p>
      </section>
    </div>
  );
}
