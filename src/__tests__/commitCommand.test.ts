import { CommitCommand } from '../commands/commit';
import { GitService } from '../commands/git';
import { ConfigService } from '../commands/config';
import readline from 'readline';
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
    getConfig: jest.fn(),
    validateConfig: jest.fn()
  }
}));

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
      diff: 'diff --git a/file b/file'
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
      .mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(confirmSpy).toHaveBeenCalled();
    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should skip commit when user declines confirmation', async () => {
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(false);

    await (command as any).handleCommit({});

    expect(GitService.createCommit).not.toHaveBeenCalled();
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should save generated message to cache before user confirmation', async () => {
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(false);

    await (command as any).handleCommit({ prompt: 'mention tests' });

    expect(CommitMessageCacheService.createKey).toHaveBeenCalledWith({
      diff: 'diff --git a/file b/file',
      prompt: 'mention tests',
      language: 'ko'
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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(false);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(false);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({ push: true });

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit when commit creation fails', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(false);
    (GitService.hasModifiedFiles as jest.Mock).mockResolvedValue(false);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledWith(
      'feat: test commit\n\nCo-authored-by: Bob <bob@example.com>'
    );
  });

  it('should exit when push fails', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);
    (GitService.push as jest.Mock).mockResolvedValue(false);

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

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
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  describe('confirmCommit', () => {
    it('returns true for y', async () => {
      const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
        question: jest.fn((_prompt, callback) => callback('y')),
        close: jest.fn()
      } as any);

      try {
        const command = createCommand();
        const result = await (command as any).confirmCommit();

        expect(result).toBe(true);
      } finally {
        createInterfaceSpy.mockRestore();
      }
    });

    it('returns false for n', async () => {
      const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
        question: jest.fn((_prompt, callback) => callback('n')),
        close: jest.fn()
      } as any);

      try {
        const command = createCommand();
        const result = await (command as any).confirmCommit();

        expect(result).toBe(false);
      } finally {
        createInterfaceSpy.mockRestore();
      }
    });
  });
});
