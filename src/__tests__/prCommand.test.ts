import { PullRequestCommand } from '../commands/prCommand';
import { GitService } from '../commands/git';
import { AIService } from '../commands/ai';
import { ConfigService } from '../commands/config';

const mockGeneratePullRequestMessage = jest.fn();

jest.mock('../commands/git', () => ({
  GitService: {
    getBranchDiff: jest.fn()
  }
}));

jest.mock('../commands/ai', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    generatePullRequestMessage: mockGeneratePullRequestMessage
  }))
}));

jest.mock('../commands/config', () => ({
  ConfigService: {
    getConfig: jest.fn(),
    validateConfig: jest.fn()
  }
}));

describe('PullRequestCommand', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  beforeEach(() => {
    jest.clearAllMocks();

    (ConfigService.getConfig as jest.Mock).mockReturnValue({
      apiKey: 'config-key',
      baseURL: 'https://api.test',
      model: 'test-model',
      language: 'ko',
      autoPush: false
    });

    (ConfigService.validateConfig as jest.Mock).mockReturnValue(undefined);

    (GitService.getBranchDiff as jest.Mock).mockResolvedValue({
      success: true,
      diff: 'diff --git a/file b/file'
    });

    mockGeneratePullRequestMessage.mockResolvedValue({
      success: true,
      message: 'Add caching layer\n\n## Summary\n- ...\n\n## Testing\n- ...'
    });
  });

  afterAll(() => {
    exitSpy.mockRestore();
  });

  const createCommand = () => new PullRequestCommand();

  it('prints generated pull request message on success', async () => {
    const command = createCommand();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await (command as any).handlePullRequest({ base: 'main', compare: 'feature/cache' });

      expect(ConfigService.validateConfig).toHaveBeenCalledWith({
        apiKey: 'config-key',
        language: 'ko'
      });
      expect(GitService.getBranchDiff).toHaveBeenCalledWith('main', 'feature/cache');
      expect(mockGeneratePullRequestMessage).toHaveBeenCalledWith(
        'main',
        'feature/cache',
        'diff --git a/file b/file'
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Add caching layer'));
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('exits when diff retrieval fails', async () => {
    (GitService.getBranchDiff as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'diff error'
    });

    const command = createCommand();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await (command as any).handlePullRequest({ base: 'main', compare: 'feature/cache' });

      expect(errorSpy).toHaveBeenCalledWith('Error:', 'diff error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('exits when AI generation fails', async () => {
    mockGeneratePullRequestMessage.mockResolvedValueOnce({
      success: false,
      error: 'ai error'
    });

    const command = createCommand();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await (command as any).handlePullRequest({ base: 'main', compare: 'feature/cache' });

      expect(errorSpy).toHaveBeenCalledWith('Error:', 'ai error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
