import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

interface CacheKeyInput {
  diff: string;
  prompt?: string;
  language: string;
}

interface CommitMessageCacheEntry {
  version: 1;
  key: string;
  message: string;
  timestamp: string;
  project: string;
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

export class CommitMessageCacheService {
  static createKey(input: CacheKeyInput): string {
    const project = getProjectIdentifier();
    const payload = JSON.stringify({
      version: 1,
      project,
      language: input.language,
      prompt: input.prompt ?? '',
      diff: input.diff
    });

    return createHash('sha256').update(payload).digest('hex');
  }

  static async find(key: string): Promise<string | undefined> {
    try {
      const raw = await fs.readFile(getCachePath(), 'utf-8');
      const lines = raw.split('\n').filter(Boolean).reverse();

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Partial<CommitMessageCacheEntry>;
          if (entry.version === 1 && entry.key === key && typeof entry.message === 'string') {
            return entry.message;
          }
        } catch {
          // Ignore malformed cache rows.
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  static async save(key: string, message: string): Promise<void> {
    try {
      const file = getCachePath();
      await fs.mkdir(path.dirname(file), { recursive: true });

      const entry: CommitMessageCacheEntry = {
        version: 1,
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
