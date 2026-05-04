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
