import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_DAYS = 7;

export const COMMIT_MESSAGE_CACHE_PROMPT_VERSION = 2;

interface CacheKeyInput {
  diff: string;
  prompt?: string;
  language: string;
}

interface CommitMessageCacheEntry {
  version: 1;
  promptVersion: number;
  key: string;
  message: string;
  timestamp: string;
  project: string;
}

export interface CommitMessageCacheHit {
  message: string;
  timestamp: string;
  expiresAt: string;
  daysRemaining: number;
}

function getStorageDir(): string {
  const override = process.env.GIT_AI_COMMIT_CONFIG_PATH;
  return override ? path.dirname(path.resolve(override)) : path.join(os.homedir(), '.git-ai-commit');
}

function getCachePath(): string {
  return path.join(getStorageDir(), 'commit-message-cache.jsonl');
}

function getProjectIdentifier(): string {
  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (remote) {
      return remote;
    }
  } catch {
    // Fall back to the current directory for repositories without a remote.
  }

  return process.cwd();
}

function isCacheEntry(value: unknown): value is CommitMessageCacheEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<CommitMessageCacheEntry>;
  return entry.version === 1
    && typeof entry.promptVersion === 'number'
    && typeof entry.key === 'string'
    && typeof entry.message === 'string'
    && typeof entry.timestamp === 'string'
    && typeof entry.project === 'string';
}

function isFresh(entry: CommitMessageCacheEntry, now = Date.now()): boolean {
  const timestamp = Date.parse(entry.timestamp);
  return Number.isFinite(timestamp) && now - timestamp <= CACHE_TTL_MS;
}

async function readFreshEntries(): Promise<CommitMessageCacheEntry[]> {
  try {
    const file = getCachePath();
    const raw = await fs.readFile(file, 'utf-8');
    const entries = raw
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          const parsed = JSON.parse(line) as unknown;
          return isCacheEntry(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      })
      .filter((entry): entry is CommitMessageCacheEntry => Boolean(entry))
      .filter(entry => isFresh(entry));

    await fs.writeFile(file, entries.map(entry => JSON.stringify(entry)).join('\n') + (entries.length > 0 ? '\n' : ''), 'utf-8');
    return entries;
  } catch {
    return [];
  }
}

export class CommitMessageCacheService {
  static createKey(input: CacheKeyInput): string {
    const project = getProjectIdentifier();
    const payload = JSON.stringify({
      version: 1,
      promptVersion: COMMIT_MESSAGE_CACHE_PROMPT_VERSION,
      project,
      language: input.language,
      prompt: input.prompt ?? '',
      diff: input.diff
    });

    return createHash('sha256').update(payload).digest('hex');
  }

  static async find(key: string): Promise<CommitMessageCacheHit | undefined> {
    const entries = await readFreshEntries();
    const entry = [...entries].reverse().find(candidate => candidate.key === key);
    if (!entry) {
      return undefined;
    }

    const timestamp = Date.parse(entry.timestamp);
    const expiresAtMs = timestamp + CACHE_TTL_MS;

    return {
      message: entry.message,
      timestamp: entry.timestamp,
      expiresAt: new Date(expiresAtMs).toISOString(),
      daysRemaining: Math.max(0, Math.ceil((expiresAtMs - Date.now()) / (CACHE_TTL_MS / CACHE_TTL_DAYS)))
    };
  }

  static async save(key: string, message: string): Promise<void> {
    try {
      const file = getCachePath();
      await fs.mkdir(path.dirname(file), { recursive: true });

      await readFreshEntries();

      const entry: CommitMessageCacheEntry = {
        version: 1,
        promptVersion: COMMIT_MESSAGE_CACHE_PROMPT_VERSION,
        key,
        message,
        timestamp: new Date().toISOString(),
        project: getProjectIdentifier()
      };

      await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch {
      // Cache writes should never block committing.
    }
  }
}
