import { CommitCommand } from '../commands/commit';
import { GitService } from '../commands/git';
import { ConfigService } from '../commands/config';
import readline from 'readline';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { editCommitMessage } from '../commands/editor';
import { CommitMessageCacheService } from '../commands/commitCache';

const mockGenerateCommitMessage = jest.fn();
const cachedMessageHit = {
  message: 'fix: cached commit',
  timestamp: '2026-05-04T00:00:00.000Z',
  expiresAt: '2026-05-11T00:00:00.000Z',
  daysRemaining: 7
};

jest.mock('../commands/git', () => ({
  GitService: {
    getStagedDiff: jest.fn(),
    getStagedStat: jest.fn().mockResolvedValue(''),
    createCommit: jest.fn(),
    push: jest.fn(),
    hasModifiedFiles: jest.fn().mockResolvedValue(false),
    restageModifiedFiles: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('../commands/ai', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    generateCommitMessage: mockGenerateCommitMessage
  }))
}));

jest.mock('../commands/config', () => ({
  ConfigService: {
    getProjectInstructions: jest.fn().mockReturnValue(''),
    getConfig: jest.fn(),
    validateConfig: jest.fn()
  }
}));

jest.mock('../commands/editor', () => ({ editCommitMessage: jest.fn() }));
jest.mock('../commands/log', () => ({ LogService: { append: jest.fn().mockResolvedValue(undefined) } }));

jest.mock('../commands/commitCache', () => ({
  CommitMessageCacheService: {
    createKey: jest.fn(),
    find: jest.fn(),
    save: jest.fn()
  }
}));

describe('CommitCommand', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  beforeEach(() => {
    jest.clearAllMocks();

    (ConfigService.getConfig as jest.Mock).mockReturnValue({
      apiKey: 'env-key',
      baseURL: 'https://api.test',
      model: 'test-model',
      language: 'ko',
      autoPush: false
    });

    (ConfigService.validateConfig as jest.Mock).mockReturnValue(undefined);
    (CommitMessageCacheService.createKey as jest.Mock).mockReturnValue('cache-key-12345678');
    (CommitMessageCacheService.find as jest.Mock).mockResolvedValue(undefined);
    (CommitMessageCacheService.save as jest.Mock).mockResolvedValue(undefined);

    (GitService.getStagedDiff as jest.Mock).mockResolvedValue({
      success: true,
      diff: 'diff --git a/file b/file',
      diffHash: 'full-diff-hash'
    });

    mockGenerateCommitMessage.mockResolvedValue({
      success: true,
      message: 'feat: test commit'
    });
  });

  afterAll(() => {
    exitSpy.mockRestore();
  });

  const createCommand = () => new CommitCommand();

  it('should create commit after user confirmation', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    const confirmSpy = jest
      .spyOn(command as any, 'confirmCommit')
      .mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(confirmSpy).toHaveBeenCalled();
    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should skip commit when user declines confirmation', async () => {
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('cancel');

    await (command as any).handleCommit({});

    expect(GitService.createCommit).not.toHaveBeenCalled();
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should save generated message to cache before user confirmation', async () => {
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('cancel');

    await (command as any).handleCommit({ prompt: 'mention tests' });

    expect(CommitMessageCacheService.createKey).toHaveBeenCalledWith({
      diff: 'diff --git a/file b/file',
      diffHash: 'full-diff-hash',
      prompt: 'mention tests',
      language: 'ko',
      generation: expect.objectContaining({ model: 'test-model', baseURL: 'https://api.test' })
    });
    expect(CommitMessageCacheService.save).toHaveBeenCalledWith(
      'cache-key-12345678',
      'feat: test commit'
    );
    expect(GitService.createCommit).not.toHaveBeenCalled();
  });

  it('should reuse cached message for the same staged request', async () => {
    (CommitMessageCacheService.find as jest.Mock).mockResolvedValue(cachedMessageHit);
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    try {
      await (command as any).handleCommit({});

      expect(mockGenerateCommitMessage).not.toHaveBeenCalled();
      expect(CommitMessageCacheService.save).not.toHaveBeenCalled();
      expect(ConfigService.validateConfig).not.toHaveBeenCalled();
      expect(GitService.createCommit).toHaveBeenCalledWith('fix: cached commit');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('saved 2026-05-04, expires 2026-05-11')
      );
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('should skip cache reads and writes when cache is disabled', async () => {
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('cancel');

    await (command as any).handleCommit({ cache: false });

    expect(CommitMessageCacheService.createKey).not.toHaveBeenCalled();
    expect(CommitMessageCacheService.find).not.toHaveBeenCalled();
    expect(CommitMessageCacheService.save).not.toHaveBeenCalled();
    expect(mockGenerateCommitMessage).toHaveBeenCalledWith(
      'diff --git a/file b/file',
      undefined
    );
  });

  it('should refresh cached messages when refresh is requested', async () => {
    (CommitMessageCacheService.find as jest.Mock).mockResolvedValue(cachedMessageHit);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('cancel');

    await (command as any).handleCommit({ refresh: true });

    expect(CommitMessageCacheService.createKey).toHaveBeenCalled();
    expect(CommitMessageCacheService.find).not.toHaveBeenCalled();
    expect(mockGenerateCommitMessage).toHaveBeenCalledWith(
      'diff --git a/file b/file',
      undefined
    );
    expect(CommitMessageCacheService.save).toHaveBeenCalledWith(
      'cache-key-12345678',
      'feat: test commit'
    );
  });

  it('includes project rules and gives per-run instructions explicit precedence', async () => {
    (ConfigService.getProjectInstructions as jest.Mock).mockReturnValueOnce('Write in English');
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('cancel');
    await (command as any).handleCommit({ prompt: 'Write in Korean' });
    const prompt = '## Project instructions (.git-ai-commit.md)\nWrite in English\n\n## Per-run instructions\nWrite in Korean';
    expect(mockGenerateCommitMessage).toHaveBeenCalledWith('diff --git a/file b/file', prompt);
    expect(CommitMessageCacheService.createKey).toHaveBeenCalledWith(expect.objectContaining({ prompt }));
  });

  it('edits without another model call and commits only after a new confirmation', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gac-unit-draft-'));
    const draftPath = path.join(directory, 'COMMIT_EDITMSG');
    fs.writeFileSync(draftPath, 'fix: edited message');
    (editCommitMessage as jest.Mock).mockReturnValueOnce({ message: 'fix: edited message', draftPath });
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);
    const command = createCommand();
    const confirm = jest.spyOn(command as any, 'confirmCommit')
      .mockResolvedValueOnce('edit').mockResolvedValueOnce('commit');
    await (command as any).handleCommit({});
    expect(editCommitMessage).toHaveBeenCalledWith('feat: test commit');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(mockGenerateCommitMessage).toHaveBeenCalledTimes(1);
    expect(GitService.createCommit).toHaveBeenCalledWith('fix: edited message');
    expect(fs.existsSync(draftPath)).toBe(false);
  });

  it('preserves edited drafts if Git rejects the commit', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gac-unit-draft-'));
    const draftPath = path.join(directory, 'COMMIT_EDITMSG');
    fs.writeFileSync(draftPath, 'fix: valuable manual edit');
    (editCommitMessage as jest.Mock).mockReturnValueOnce({ message: 'fix: valuable manual edit', draftPath });
    (GitService.createCommit as jest.Mock).mockResolvedValueOnce(false);
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValueOnce('edit').mockResolvedValueOnce('commit');
    try {
      await (command as any).handleCommit({});
      expect(fs.readFileSync(draftPath, 'utf-8')).toBe('fix: valuable manual edit');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('regenerates a cached message and allows cancellation without committing', async () => {
    (CommitMessageCacheService.find as jest.Mock).mockResolvedValueOnce(cachedMessageHit);
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit')
      .mockResolvedValueOnce('regenerate').mockResolvedValueOnce('cancel');
    await (command as any).handleCommit({});
    expect(mockGenerateCommitMessage).toHaveBeenCalledTimes(1);
    expect(CommitMessageCacheService.find).toHaveBeenCalledTimes(1);
    expect(CommitMessageCacheService.save).toHaveBeenCalledWith('cache-key-12345678', 'feat: test commit');
    expect(GitService.createCommit).not.toHaveBeenCalled();
  });

  it('does not commit or push when editing fails', async () => {
    (editCommitMessage as jest.Mock).mockImplementationOnce(() => { throw new Error('Editor failed'); });
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValueOnce('edit');
    await (command as any).handleCommit({ push: true });
    expect(GitService.createCommit).not.toHaveBeenCalled();
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should output message only without git actions when message-only option is set', async () => {
    const command = createCommand();
    const confirmSpy = jest.spyOn(command as any, 'confirmCommit');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await (command as any).handleCommit({ messageOnly: true });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(GitService.createCommit).not.toHaveBeenCalled();
      expect(GitService.push).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('feat: test commit');
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('should commit and push when push option is provided', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);
    (GitService.push as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({ push: true });

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit when commit creation fails', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(false);
    (GitService.hasModifiedFiles as jest.Mock).mockResolvedValue(false);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should re-stage and retry when pre-commit hook modifies files', async () => {
    (GitService.createCommit as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (GitService.hasModifiedFiles as jest.Mock).mockResolvedValue(true);
    (GitService.restageModifiedFiles as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledTimes(2);
    expect(GitService.createCommit).toHaveBeenNthCalledWith(1, 'feat: test commit');
    expect(GitService.createCommit).toHaveBeenNthCalledWith(2, 'feat: test commit', true);
    expect(GitService.restageModifiedFiles).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit when retry after re-stage also fails', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(false);
    (GitService.hasModifiedFiles as jest.Mock).mockResolvedValue(true);
    (GitService.restageModifiedFiles as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit when staged diff fails', async () => {
    (GitService.getStagedDiff as jest.Mock).mockResolvedValue({
      success: false,
      error: 'No staged changes found'
    });
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  it('should exit when AI generation fails', async () => {
    mockGenerateCommitMessage.mockResolvedValue({
      success: false,
      error: 'AI failed'
    });
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  it('should exit when AI returns non-string message', async () => {
    mockGenerateCommitMessage.mockResolvedValue({
      success: true,
      message: undefined
    });
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should append co-author trailer when configured', async () => {
    (ConfigService.getConfig as jest.Mock).mockReturnValue({
      apiKey: 'env-key',
      baseURL: 'https://api.test',
      model: 'test-model',
      language: 'ko',
      autoPush: false,
      coAuthor: 'Bob <bob@example.com>'
    });
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledWith(
      'feat: test commit\n\nCo-authored-by: Bob <bob@example.com>'
    );
  });

  it('should exit when push fails', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);
    (GitService.push as jest.Mock).mockResolvedValue(false);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({ push: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should push automatically when autoPush is enabled in config', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);
    (GitService.push as jest.Mock).mockResolvedValue(true);

    (ConfigService.getConfig as jest.Mock).mockReturnValueOnce({
      apiKey: 'env-key',
      baseURL: 'https://api.test',
      model: 'test-model',
      language: 'ko',
      autoPush: true
    });

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue('commit');

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  describe('confirmCommit', () => {
    it('cancels on end of input without waiting for a response', async () => {
      const rl = Object.assign(new EventEmitter(), { question: jest.fn(), close: jest.fn() });
      const spy = jest.spyOn(readline, 'createInterface').mockReturnValue(rl as unknown as readline.Interface);
      try {
        const result = (createCommand() as any).confirmCommit();
        rl.emit('close');
        expect(await result).toBe('cancel');
      } finally { spy.mockRestore(); }
    });

    it.each([['e', 'edit'], ['r', 'regenerate'], ['', 'cancel']])('maps %s to %s', async (answer, expected) => {
      const spy = jest.spyOn(readline, 'createInterface').mockReturnValue({
        question: jest.fn((_prompt, callback) => callback(answer)),
        close: jest.fn(), once: jest.fn()
      } as any);
      try {
        expect(await (createCommand() as any).confirmCommit()).toBe(expected);
      } finally { spy.mockRestore(); }
    });

    it('returns commit for y', async () => {
      const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
        question: jest.fn((_prompt, callback) => callback('y')),
        close: jest.fn(),
        once: jest.fn()
      } as any);

      try {
        const command = createCommand();
        const result = await (command as any).confirmCommit();

        expect(result).toBe('commit');
      } finally {
        createInterfaceSpy.mockRestore();
      }
    });

    it('returns cancel for n', async () => {
      const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
        question: jest.fn((_prompt, callback) => callback('n')),
        close: jest.fn(),
        once: jest.fn()
      } as any);

      try {
        const command = createCommand();
        const result = await (command as any).confirmCommit();

        expect(result).toBe('cancel');
      } finally {
        createInterfaceSpy.mockRestore();
      }
    });
  });
});
