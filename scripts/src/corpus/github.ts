/** Thin GitHub REST client on the session's `gh auth token`. Network lives here and nowhere else in the pipeline. */
import { execFileSync } from 'node:child_process';
import { bodySha, sha256 } from './text.js';
import type { Comment, Thread } from './types.js';

const API = 'https://api.github.com';
let token: string | null = null;

function ghToken(): string {
  if (token) return token;
  token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  if (!token) throw new Error('gh auth token returned nothing; run `gh auth login`');
  return token;
}

type Json = Record<string, unknown>;

async function api<T = Json>(
  path: string,
  params: Record<string, string> = {},
): Promise<{ data: T; next: string | null; status: number }> {
  const url = new URL(path.startsWith('http') ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ghToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kitsmith-corpus (so101-assembly-guide)',
    },
  });
  if (res.status === 404) return { data: null as T, next: null, status: 404 };
  if (!res.ok) throw new Error(`GitHub ${res.status} ${url}: ${(await res.text()).slice(0, 200)}`);
  const link = res.headers.get('link') ?? '';
  const next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  return { data: (await res.json()) as T, next, status: res.status };
}

async function paged<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = path;
  let p: Record<string, string> = { ...params, per_page: '100' };
  while (url) {
    const r: { data: T[]; next: string | null } = await api<T[]>(url, p);
    out.push(...(r.data ?? []));
    url = r.next;
    p = {};
  }
  return out;
}

type RawIssue = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  user: { login: string };
  author_association: string;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
};
type RawComment = {
  id: number;
  html_url: string;
  body: string | null;
  user: { login: string };
  author_association: string;
  created_at: string;
  updated_at: string;
};

export type IssueStub = {
  owner: string;
  repo: string;
  number: number;
  updated_at: string;
  title: string;
  url: string;
};

/** Issues updated since `since` (ISO) matching the free-text query. Search is eventually consistent; callers add overlap. */
export async function searchIssues(
  owner: string,
  repo: string,
  query: string,
  since: string,
): Promise<IssueStub[]> {
  const q = `repo:${owner}/${repo} is:issue (${query}) updated:>=${since.slice(0, 10)}`;
  const out: IssueStub[] = [];
  let url: string | null = '/search/issues';
  let p: Record<string, string> = { q, sort: 'updated', order: 'desc', per_page: '100' };
  while (url) {
    const r: { data: { items: RawIssue[] }; next: string | null } = await api<{
      items: RawIssue[];
    }>(url, p);
    for (const i of r.data?.items ?? [])
      out.push({
        owner,
        repo,
        number: i.number,
        updated_at: i.updated_at,
        title: i.title,
        url: i.html_url,
      });
    url = r.next;
    p = {};
  }
  return out;
}

/** Every issue (not PR) in the repo updated since `since`; optional label filter. */
export async function listIssues(
  owner: string,
  repo: string,
  since: string,
  label?: string,
): Promise<IssueStub[]> {
  const params: Record<string, string> = {
    state: 'all',
    since,
    sort: 'updated',
    direction: 'desc',
  };
  if (label) params.labels = label;
  const items = await paged<RawIssue>(`/repos/${owner}/${repo}/issues`, params);
  return items
    .filter((i) => !i.pull_request)
    .map((i) => ({
      owner,
      repo,
      number: i.number,
      updated_at: i.updated_at,
      title: i.title,
      url: i.html_url,
    }));
}

export async function getIssueStub(
  owner: string,
  repo: string,
  number: number,
): Promise<IssueStub | null> {
  const r = await api<RawIssue>(`/repos/${owner}/${repo}/issues/${number}`);
  if (r.status === 404 || !r.data) return null;
  const i = r.data;
  return { owner, repo, number, updated_at: i.updated_at, title: i.title, url: i.html_url };
}

/** The whole thread: issue body as comment 0 plus every comment, with the fields the grounding contract needs. */
export async function fetchThread(
  owner: string,
  repo: string,
  number: number,
  retrieved: string,
): Promise<Thread | null> {
  const r = await api<RawIssue>(`/repos/${owner}/${repo}/issues/${number}`);
  if (r.status === 404 || !r.data) return null;
  const i = r.data;
  const raw = await paged<RawComment>(`/repos/${owner}/${repo}/issues/${number}/comments`, {});
  const body: Comment = {
    id: 0,
    url: i.html_url,
    author: i.user.login,
    author_association: i.author_association,
    created_at: i.created_at,
    updated_at: i.updated_at,
    body: i.body ?? '',
    body_sha256: bodySha(i.body ?? ''),
  };
  const comments: Comment[] = [
    body,
    ...raw.map((c) => ({
      id: c.id,
      url: c.html_url,
      author: c.user.login,
      author_association: c.author_association,
      created_at: c.created_at,
      updated_at: c.updated_at,
      body: c.body ?? '',
      body_sha256: bodySha(c.body ?? ''),
    })),
  ];
  return {
    key: `${owner}/${repo}#${number}`,
    owner,
    repo,
    number,
    url: i.html_url,
    title: i.title,
    state: i.state,
    author: i.user.login,
    created_at: i.created_at,
    updated_at: i.updated_at,
    retrieved,
    content_sha256: sha256(comments.map((c) => c.body_sha256).join('\n')),
    comments,
  };
}

export async function getComment(owner: string, repo: string, id: number): Promise<Comment | null> {
  const r = await api<RawComment>(`/repos/${owner}/${repo}/issues/comments/${id}`);
  if (r.status === 404 || !r.data) return null;
  const c = r.data;
  return {
    id: c.id,
    url: c.html_url,
    author: c.user.login,
    author_association: c.author_association,
    created_at: c.created_at,
    updated_at: c.updated_at,
    body: c.body ?? '',
    body_sha256: bodySha(c.body ?? ''),
  };
}

/** Raw file content at a commit. */
export async function fetchBlob(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`, {
    headers: { 'User-Agent': 'kitsmith-corpus (so101-assembly-guide)' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`raw ${res.status} ${owner}/${repo}@${sha}/${path}`);
  return res.text();
}

/** Ask the Wayback Machine to snapshot a URL. Best effort: null on any failure. */
export async function archiveUrl(url: string, timeoutMs = 45000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      method: 'GET',
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': 'kitsmith-corpus (so101-assembly-guide)' },
    });
    const loc = res.headers.get('content-location') ?? res.headers.get('location');
    if (loc?.startsWith('/web/')) return `https://web.archive.org${loc}`;
    if (loc?.startsWith('https://web.archive.org/web/')) return loc;
    if (res.ok && res.url.startsWith('https://web.archive.org/web/')) return res.url;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
