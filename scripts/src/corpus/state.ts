/** Files the pipeline reads and writes: config, state, staging, run dir. YAML goes through Document so comments survive. */
import fs from 'node:fs';
import path from 'node:path';
import { parse, parseDocument, stringify } from 'yaml';
import { DATA_DIR, REPO_ROOT } from '../paths.js';
import type { CorpusConfig, CorpusState, Staging, Thread } from './types.js';

export const CORPUS_DIR = path.join(REPO_ROOT, 'scripts', 'corpus');
export const CONFIG_FILE = path.join(CORPUS_DIR, 'config.json');
export const PROMPTS_DIR = path.join(CORPUS_DIR, 'prompts');
export const STAGING_DIR = path.join(DATA_DIR, 'staging');
export const STAGING_FILE = path.join(STAGING_DIR, 'troubleshooting-candidates.yaml');
export const STATE_FILE = path.join(STAGING_DIR, 'corpus-state.json');
export const LIVE_FILE = path.join(DATA_DIR, 'troubleshooting.yaml');
export const DISCREPANCIES_FILE = path.join(DATA_DIR, 'discrepancies.md');
/** Gitignored; survives the session so a run can be inspected. */
export const RUNS_DIR = path.join(REPO_ROOT, '.claude', 'investigations', 'corpus');

export function loadConfig(file = CONFIG_FILE): CorpusConfig {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusConfig;
}

export function loadState(file = STATE_FILE): CorpusState {
  if (!fs.existsSync(file)) return { watermarks: {}, index: {}, ledger: {}, retired_slugs: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusState;
}

export function saveState(state: CorpusState, file = STATE_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

export function loadStaging(file = STAGING_FILE): Staging {
  const doc = parse(fs.readFileSync(file, 'utf8')) as Staging | null;
  return doc ?? { candidates: [] };
}

/** Rewrite the candidates list in place, keeping the file's header comments. */
export function saveStaging(staging: Staging, file = STAGING_FILE): void {
  const doc = parseDocument(fs.readFileSync(file, 'utf8'));
  const fresh = parseDocument(stringify(staging, { lineWidth: 120 }));
  const head = doc.commentBefore;
  doc.contents = fresh.contents;
  doc.commentBefore = head ?? null;
  fs.writeFileSync(file, doc.toString({ lineWidth: 120 }));
}

export function threadFile(runDir: string, key: string): string {
  return path.join(runDir, 'threads', key.replace('/', '__').replace('#', '__') + '.json');
}

export function loadThreads(runDir: string): Map<string, Thread> {
  const dir = path.join(runDir, 'threads');
  const out = new Map<string, Thread>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Thread;
    out.set(t.key, t);
  }
  return out;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
