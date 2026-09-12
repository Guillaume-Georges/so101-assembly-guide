/** Shapes shared by the corpus pipeline (fetch → mine → check → falsify → promote). */
import type { Issue, SourceRef } from '../load.js';

/** A GitHub issue comment; id 0 is the issue body itself. */
export type Comment = {
  id: number;
  url: string;
  author: string;
  author_association: string;
  created_at: string;
  updated_at: string;
  body: string;
  body_sha256: string;
};

export type Thread = {
  /** `${owner}/${repo}#${number}` */
  key: string;
  owner: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  state: string;
  author: string;
  created_at: string;
  updated_at: string;
  retrieved: string;
  /** sha256 over every comment sha, in order: changes when any comment is added or edited. */
  content_sha256: string;
  comments: Comment[];
};

export type EvidenceRole = 'cause' | 'fix' | 'confirmation';
export type Evidence = {
  role: EvidenceRole;
  fix_index?: number;
  url: string;
  quote: string;
  comment_id?: number;
  author?: string;
  author_association?: string;
  created_at?: string;
  body_sha256?: string;
};

export type Scope =
  'assembly' | 'setup-motors' | 'calibration' | 'lerobot-software' | 'sourcing' | 'firmware';
export type Confidence = 'confirmed' | 'reported' | 'open';

export type Candidate = {
  id: string;
  slug?: string;
  title: string;
  title_kind?: 'verbatim' | 'symptom';
  aliases?: string[];
  symptoms: string[];
  cause: string;
  fix: string[];
  related_steps?: string[];
  related_parts?: string[];
  servo_table?: 'follower' | 'leader';
  source: SourceRef[];
  evidence?: Evidence[];
  unverified?: boolean;
  scope: Scope;
  frequency?: number;
  confidence: Confidence;
  review_notes?: string;
  held?: string;
  duplicate_of?: string;
  merge_into?: string;
};

export type Staging = { candidates: Candidate[]; merges_into_existing?: unknown[] };

export type LedgerEntry = {
  content_sha256: string;
  decision: string; // new:<id> | merged:<id> | ignored:<reason> | parked | promoted:<id>
  reason?: string;
  prompt_sha?: string;
  model?: string;
  run: string;
};

export type CorpusState = {
  watermarks: Record<string, string>;
  /** comment key `${thread.key}/c${id}` → what we saw last */
  index: Record<
    string,
    { url: string; updated_at: string; retrieved: string; body_sha256: string }
  >;
  /** thread key → last decision */
  ledger: Record<string, LedgerEntry>;
  retired_slugs: string[];
};

export type SourceConfig = {
  owner: string;
  repo: string;
  mode: 'search' | 'all' | 'label';
  query?: string;
  label?: string;
  maintainer_associations: string[];
  confirms_stages: string[];
};
export type CorpusConfig = {
  sources: SourceConfig[];
  v1_scopes: string[];
  blocked_domains: string[];
  overlap_days: number;
  cap: number;
  quote_words: { min: number; max: number };
  models: { mine: string; falsify: string };
};

export type Verdict = {
  id: string;
  verdict: 'keep' | 'demote' | 'reject' | 'merge';
  into?: string;
  reason: string;
  counter?: { url: string; quote: string };
  read?: string;
};

export type Drift = {
  entry: string;
  ref: string;
  kind: 'deleted' | 'edited' | 'new-comments';
  detail: string;
};

export type FetchReport = {
  run: string;
  retrieved: string;
  backlog: boolean;
  counts: {
    delta: number;
    cited_live: number;
    cited_staged: number;
    fetched: number;
    unchanged: number;
    new: number;
    updated: number;
  };
  threads: {
    key: string;
    url: string;
    title: string;
    status: 'new' | 'updated' | 'unchanged';
    cited_by: string[];
  }[];
  drift: Drift[];
};

export type CheckReport = {
  run: string;
  pass: string[];
  demoted: { id: string; reasons: string[] }[];
  needs_title: string[];
  duplicates: { id: string; of: string }[];
  parked: string[];
  verdicts?: Verdict[];
};

export type PromotedEntry = {
  issue: Issue;
  from: string;
  frequency: number;
  falsifier: string;
  evidence: Evidence[];
};
