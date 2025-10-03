import { CommitCommand } from '../commands/commit';
import { GitService } from '../commands/git';
import { AIService } from '../commands/ai';
import { ConfigService } from '../commands/config';

const mockGenerateCommitMessage = jest.fn();

jest.mock('../commands/git', () => ({
  GitService: {
    getStagedDiff: jest.fn(),
    createCommit: jest.fn(),
    push: jest.fn()
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

    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
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
});
