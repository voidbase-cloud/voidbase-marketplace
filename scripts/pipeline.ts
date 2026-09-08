// `bun run build`, `bun run deploy`, `bun run version`: the three verbs Cloudflare Workers Builds calls, and the
// three a person calls by hand. What each one does is read from the environment (scripts/environment.ts), so the
// same word means the right thing in a build, on a branch and on a laptop, and the dashboard holds no logic:
//
//   build     the registry has to parse before anything else, because a bad listing takes the site down with it;
//             then the site into .voidbase/, then the typecheck. The same everywhere.
//   deploy    this instance, from the generated app. A person gets a build first, because nothing else has done
//             one; a build already has one. Off the production branch there is nothing to deploy.
//   version   what a branch build leaves behind: the configuration this branch would deploy with, read back from
//             the declaration and the Worker. It changes nothing, so a branch cannot touch what is live.
//
// Nothing here supervises the commands it runs. A build that hangs or fails is the build platform's to time out and
// retry.
import { environment } from "./environment";

const verb = process.argv[2] ?? "";
const here = environment();

const sh = async (cmd: string[], cwd?: string): Promise<number> =>
  Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit", stdin: "inherit" }).exited;
const say = (what: string) => console.log(`[${verb}] ${what} — ${here.describe()}`);
const done = (code: number): never => process.exit(code);

switch (verb) {
  case "build": {
    say("the registry, then the site into .voidbase/, then the typecheck");
    const registry = await sh(["bun", "scripts/registry.ts", "check"]);
    if (registry !== 0) done(registry);
    const built = await sh(["bunx", "--bun", "vite", "build"]);
    if (built !== 0) done(built);
    done(await sh(["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"]));
    break;
  }
  case "deploy": {
    if (!here.production) { console.log(`[deploy] nothing to do: ${here.branch} is not ${here.productionBranch} — ${here.describe()}`); done(0); }
    if (!here.automated) {
      say("building first, because nothing else has");
      const built = await sh(["bun", "run", "build"]);
      if (built !== 0) done(built);
    }
    say("this instance, from the generated app");
    done(await sh(["bunx", "voidbase", "deploy"], ".voidbase"));
    break;
  }
  case "version": {
    // read-only on purpose: a branch build proves its configuration without creating or changing anything
    say("the configuration this branch would deploy with");
    done(await sh(["bunx", "voidbase", "secrets"], ".voidbase"));
    break;
  }
  default:
    console.error("usage: bun run build | bun run deploy | bun run version");
    process.exit(2);
}
