import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { CommitMessageCacheService } from '../commands/commitCache';

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

    await expect(CommitMessageCacheService.find(key)).resolves.toBe('feat: cached message');
  });


  it('ignores and removes cached messages older than seven days', async () => {
    const key = CommitMessageCacheService.createKey({
      diff: 'diff --git a/file b/file',
      language: 'ko'
    });
    const cachePath = path.join(tempDir, 'commit-message-cache.jsonl');
    const expiredEntry = {
      version: 1,
      key,
      message: 'feat: expired message',
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      project: process.cwd()
    };

    await fs.writeFile(cachePath, `${JSON.stringify(expiredEntry)}
`, 'utf-8');

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
      key,
      message: 'feat: fresh message',
      timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      project: process.cwd()
    };

    await fs.writeFile(cachePath, `${JSON.stringify(freshEntry)}
`, 'utf-8');

    await expect(CommitMessageCacheService.find(key)).resolves.toBe('feat: fresh message');
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
