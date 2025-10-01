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
    getEnvConfig: jest.fn(),
    validateConfig: jest.fn()
  }
}));

describe('CommitCommand', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  beforeEach(() => {
    jest.clearAllMocks();

    (ConfigService.getEnvConfig as jest.Mock).mockReturnValue({
      apiKey: 'env-key',
      baseURL: 'https://api.test',
      model: 'test-model'
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

  it('should create commit after user confirmation when commit option is set', async () => {
    (GitService.createCommit as jest.Mock).mockResolvedValue(true);

    const command = createCommand();
    const confirmSpy = jest
      .spyOn(command as any, 'confirmCommit')
      .mockResolvedValue(true);

    await (command as any).handleCommit({ commit: true });

    expect(confirmSpy).toHaveBeenCalled();
    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should skip commit when user declines confirmation', async () => {
    const command = createCommand();
    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(false);

    await (command as any).handleCommit({ commit: true });

    expect(GitService.createCommit).not.toHaveBeenCalled();
    expect(GitService.push).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
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

    await (command as any).handleCommit({ commit: true });

    expect(GitService.createCommit).toHaveBeenCalledWith('feat: test commit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
