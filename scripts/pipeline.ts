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

// Vite 8 refuses to start under a runtime reporting Node older than 22.12, and Bun reports its own emulated Node
// version, so an old Bun fails with a message about Node that names neither Bun nor the fix. Cloudflare's build
// image pins Bun only through the BUN_VERSION build variable (there is no .bun-version file), so this says that
// out loud rather than leaving the next person to decode Vite's complaint.
function checkRuntime(): void {
  const [major = 0, minor = 0] = (process.versions.node ?? "0.0").split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 12)) return;
  console.error(
    `[build] Bun ${Bun.version} reports Node ${process.versions.node}, and Vite needs 22.12 or newer.\n` +
      `        On Cloudflare Workers Builds, set the build variable BUN_VERSION to 1.3.14 or later\n` +
      `        (Settings > Build > Variables and secrets). Locally, upgrade Bun.`,
  );
  process.exit(1);
}

const sh = async (cmd: string[], cwd?: string): Promise<number> =>
  Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit", stdin: "inherit" }).exited;
const say = (what: string) => console.log(`[${verb}] ${what} — ${here.describe()}`);
const done = (code: number): never => process.exit(code);

switch (verb) {
  case "build": {
    say("the registry, then the site into .voidbase/, then the typecheck");
    checkRuntime();
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
