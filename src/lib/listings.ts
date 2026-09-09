// The registry, as the pages see it.
//
// Imported rather than fetched: the site is prerendered, so the listing is baked into the HTML at build time and a
// new listing goes live when the deploy does. That is the same property the registry has in git, carried through to
// the pages.
import plugins from "../../registry/plugins.json";
import templates from "../../registry/templates.json";
import index from "../../registry/v1/index.json";
import type { Entry, Kind } from "./registry";

export const LISTINGS: Record<Kind, Entry[]> = {
  template: (templates.entries as Entry[]) ?? [],
  plugin: (plugins.entries as Entry[]) ?? [],
};

export const repoUrl = (repository: string) => `https://github.com/${repository}`;
/** GitHub's own one-click clone, which is the only way to use a template until voidbase has one of its own */
export const useTemplateUrl = (repository: string) => `https://github.com/${repository}/generate`;
export const SUBMIT = {
  template: "https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-template.yml",
  plugin: "https://github.com/voidbase-cloud/voidbase-marketplace/issues/new?template=submit-plugin.yml",
};

/** what this marketplace serves for a listed plugin, by repository: the releases, as the registry protocol carries them */
export interface Release { name: string; repository: string; latest: string; versions: { version: string; bytes: number; integrity: string; bundle: string; publishedOn: string }[] }
export const RELEASES = new Map<string, Release>((index.plugins as Release[]).map((p) => [p.repository, p]));
export const registryUrl = (path: string) => `/registry/v1/${path}`;
