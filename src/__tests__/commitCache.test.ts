import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

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

  it('separates full diffs, project rules, models and generation settings', () => {
    const input = { diff: 'same truncated preview', diffHash: 'full-a', language: 'ko',
      prompt: 'project rules', generation: { model: 'model-a', baseURL: 'https://api.test', reasoning: false } };
    const key = CommitMessageCacheService.createKey(input);
    const changes = [
      { ...input, diffHash: 'full-b' },
      { ...input, prompt: 'changed project rules' },
      { ...input, generation: { ...input.generation, model: 'model-b' } },
      { ...input, generation: { ...input.generation, baseURL: 'https://other.test' } },
      { ...input, generation: { ...input.generation, reasoning: true } }
    ];
    for (const changed of changes) expect(CommitMessageCacheService.createKey(changed)).not.toBe(key);
  });

  it('does not reuse messages generated with the previous prompt version', async () => {
    const input = { diff: 'diff --git a/file b/file', language: 'ko' };
    const newKey = CommitMessageCacheService.createKey(input);
    await CommitMessageCacheService.save(newKey, 'feat: old prompt output');
    const cachePath = path.join(tempDir, 'commit-message-cache.jsonl');
    const entry = JSON.parse(await fs.readFile(cachePath, 'utf-8'));
    const previousPromptVersion = COMMIT_MESSAGE_CACHE_PROMPT_VERSION - 1;
    const oldKey = createHash('sha256').update(JSON.stringify({
      version: 1,
      promptVersion: previousPromptVersion,
      project: entry.project,
      language: input.language,
      prompt: '',
      diff: input.diff
    })).digest('hex');
    const oldEntry = {
      ...entry,
      promptVersion: previousPromptVersion,
      key: oldKey
    };
    await fs.writeFile(cachePath, `${JSON.stringify(oldEntry)}\n`, 'utf-8');

    expect(newKey).not.toBe(oldKey);
    await expect(CommitMessageCacheService.find(newKey)).resolves.toBeUndefined();
    expect(await fs.readFile(cachePath, 'utf-8')).toContain(oldEntry.message);
  });
});
