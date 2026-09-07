import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const SCHEMA_DIR = path.join(DATA_DIR, 'schema');
export const ASSEMBLIES_DIR = path.join(DATA_DIR, 'assemblies');
/** The tracked, published copy; pipeline/out is the gitignored working output. */
export const PLACEMENTS_JSON = path.join(
  REPO_ROOT,
  'viewer',
  'public',
  'geometry',
  'placements.json',
);
export const GENERATED_DIR = path.join(REPO_ROOT, 'viewer', 'src', 'generated');
