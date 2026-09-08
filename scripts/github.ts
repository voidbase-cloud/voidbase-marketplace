// The GitHub calls the submission scripts make. Read-only against the submitted repository, authenticated only so
// the rate limit is the workflow's rather than the runner's.
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const token = () => process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

async function gh<T>(path: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${API}${path}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "voidbase-marketplace", ...(token() ? { authorization: `Bearer ${token()}` } : {}) },
  });
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`);
  return { status: res.status, body: (await res.json()) as T };
}

export interface RepoFacts {
  exists: boolean;
  private: boolean;
  archived: boolean;
  fork: boolean;
  licence: string | null;
  description: string | null;
  isTemplate: boolean;
  pushedAt: string | null;
  defaultBranch: string;
  stars: number;
}

export async function repoFacts(repository: string): Promise<RepoFacts> {
  const { body } = await gh<{ private: boolean; archived: boolean; fork: boolean; description: string | null; is_template: boolean; pushed_at: string | null; default_branch: string; stargazers_count: number; license: { spdx_id: string } | null }>(`/repos/${repository}`);
  if (!body) return { exists: false, private: true, archived: false, fork: false, licence: null, description: null, isTemplate: false, pushedAt: null, defaultBranch: "main", stars: 0 };
  return {
    exists: true,
    private: body.private,
    archived: body.archived,
    fork: body.fork,
    // NOASSERTION means GitHub found a licence file it could not identify, which is not the same as a licence
    licence: body.license?.spdx_id && body.license.spdx_id !== "NOASSERTION" ? body.license.spdx_id : null,
    description: body.description,
    isTemplate: body.is_template,
    pushedAt: body.pushed_at,
    defaultBranch: body.default_branch || "main",
    stars: body.stargazers_count ?? 0,
  };
}

/** the tip of the default branch, recorded with a listing so a later change to the repository is visible as one */
export async function headCommit(repository: string, branch: string): Promise<string | null> {
  const { body } = await gh<{ sha: string }>(`/repos/${repository}/commits/${encodeURIComponent(branch)}`);
  return body?.sha ?? null;
}

/** the paths in the repository root, which is enough to tell a voidbase project from anything else */
export async function rootPaths(repository: string, ref: string): Promise<string[]> {
  const { body } = await gh<{ tree: { path: string; type: string }[] }>(`/repos/${repository}/git/trees/${encodeURIComponent(ref)}`);
  return (body?.tree ?? []).map((t) => t.path);
}

export async function fileAt(repository: string, ref: string, path: string): Promise<string | null> {
  const { body } = await gh<{ content?: string; encoding?: string }>(`/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (!body?.content) return null;
  return body.encoding === "base64" ? Buffer.from(body.content, "base64").toString("utf8") : body.content;
}
