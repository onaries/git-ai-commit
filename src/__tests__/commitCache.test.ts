import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  COMMIT_MESSAGE_CACHE_PROMPT_VERSION,
  CommitMessageCacheService
} from '../commands/commitCache';

describe('CommitMessageCacheService', () => {
  let tempDir: string;
  const originalConfigPath = process.env.GIT_AI_COMMIT_CONFIG_PATH;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-commit-cache-'));
    process.env.GIT_AI_COMMIT_CONFIG_PATH = path.join(tempDir, 'config.json');
  });

  afterEach(async () => {
    if (originalConfigPath === undefined) {
      delete process.env.GIT_AI_COMMIT_CONFIG_PATH;
    } else {
      process.env.GIT_AI_COMMIT_CONFIG_PATH = originalConfigPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('saves and finds a cached commit message by key', async () => {
    const key = CommitMessageCacheService.createKey({
      diff: 'diff --git a/file b/file',
      prompt: 'mention tests',
      language: 'ko'
    });

    await CommitMessageCacheService.save(key, 'feat: cached message');

    await expect(CommitMessageCacheService.find(key)).resolves.toEqual(
      expect.objectContaining({
        message: 'feat: cached message',
        daysRemaining: expect.any(Number),
        expiresAt: expect.any(String),
        timestamp: expect.any(String)
      })
    );
  });

  it('stores the prompt version with cache entries', async () => {
    const key = CommitMessageCacheService.createKey({
      diff: 'diff --git a/file b/file',
      language: 'ko'
    });

    await CommitMessageCacheService.save(key, 'feat: cached message');

    const cachePath = path.join(tempDir, 'commit-message-cache.jsonl');
    const raw = await fs.readFile(cachePath, 'utf-8');
    const entry = JSON.parse(raw.trim()) as { promptVersion?: number };

    expect(entry.promptVersion).toBe(COMMIT_MESSAGE_CACHE_PROMPT_VERSION);
  });

  it('ignores and removes cached messages older than seven days', async () => {
    const key = CommitMessageCacheService.createKey({
      diff: 'diff --git a/file b/file',
      language: 'ko'
    });
    const cachePath = path.join(tempDir, 'commit-message-cache.jsonl');
    const expiredEntry = {
      version: 1,
      promptVersion: COMMIT_MESSAGE_CACHE_PROMPT_VERSION,
      key,
      message: 'feat: expired message',
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      project: process.cwd()
    };

    await fs.writeFile(cachePath, `${JSON.stringify(expiredEntry)}\n`, 'utf-8');

    await expect(CommitMessageCacheService.find(key)).resolves.toBeUndefined();
    await expect(fs.readFile(cachePath, 'utf-8')).resolves.toBe('');
  });

  it('keeps cached messages from the last seven days', async () => {
    const key = CommitMessageCacheService.createKey({
      diff: 'diff --git a/file b/file',
      language: 'ko'
    });
    const cachePath = path.join(tempDir, 'commit-message-cache.jsonl');
    const freshEntry = {
      version: 1,
      promptVersion: COMMIT_MESSAGE_CACHE_PROMPT_VERSION,
      key,
      message: 'feat: fresh message',
      timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      project: process.cwd()
    };

    await fs.writeFile(cachePath, `${JSON.stringify(freshEntry)}\n`, 'utf-8');

    await expect(CommitMessageCacheService.find(key)).resolves.toEqual(
      expect.objectContaining({ message: 'feat: fresh message' })
    );
    await expect(fs.readFile(cachePath, 'utf-8')).resolves.toContain('feat: fresh message');
  });

  it('uses prompt as part of the cache key', () => {
    const input = {
      diff: 'diff --git a/file b/file',
      language: 'ko'
    };

    const first = CommitMessageCacheService.createKey(input);
    const second = CommitMessageCacheService.createKey({ ...input, prompt: 'mention tests' });

    expect(first).not.toBe(second);
  });
});
