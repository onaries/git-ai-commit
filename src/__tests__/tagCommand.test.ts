import { TagCommand } from '../commands/tag';
import { GitService } from '../commands/git';
import { AIService } from '../commands/ai';
import { ConfigService } from '../commands/config';

jest.mock('../commands/git', () => ({
  GitService: {
    getLatestTag: jest.fn(),
    getCommitSummariesSince: jest.fn(),
    createAnnotatedTag: jest.fn()
  }
}));

const mockGenerateTagNotes = jest.fn();

jest.mock('../commands/ai', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    generateTagNotes: mockGenerateTagNotes
  }))
}));

jest.mock('../commands/config', () => ({
  ConfigService: {
    getEnvConfig: jest.fn()
  }
}));

describe('TagCommand', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    exitSpy.mockRestore();
  });

  const getTagCommand = () => new TagCommand();

  it('should create tag with provided message without invoking AI', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.2.3', { message: 'Manual release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.2.3', 'Manual release notes');
    expect(AIService).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should generate tag notes using AI when message is not provided', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValue({
      success: true,
      log: '- feat: add feature\n- fix: bug fix'
    });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);

    mockGenerateTagNotes.mockResolvedValue({
      success: true,
      notes: '- Added feature\n- Fixed bug'
    });

    const command = getTagCommand();

    await (command as any).handleTag('v1.3.0', {
      apiKey: 'test-key',
      baseUrl: 'https://api.test',
      model: 'gpt-test',
      baseTag: 'v1.2.0'
    });

    expect(GitService.getCommitSummariesSince).toHaveBeenCalledWith('v1.2.0');
    expect(AIService).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://api.test',
      model: 'gpt-test'
    });
    expect(mockGenerateTagNotes).toHaveBeenCalledWith('v1.3.0', '- feat: add feature\n- fix: bug fix');
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.3.0', '- Added feature\n- Fixed bug');
  });

  it('should exit when commit history cannot be read', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValue({
      success: false,
      error: 'No commits found'
    });
    (GitService.getLatestTag as jest.Mock).mockResolvedValue({
      success: false,
      error: 'No tags'
    });

    const command = getTagCommand();

    await (command as any).handleTag('v2.0.0', { apiKey: 'test-key' });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should use environment config when API key is not provided', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValue({
      success: true,
      log: '- chore: update deps'
    });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    mockGenerateTagNotes.mockResolvedValue({
      success: true,
      notes: '- Updated dependencies'
    });
    (ConfigService.getEnvConfig as jest.Mock).mockReturnValue({
      apiKey: 'env-key',
      baseURL: 'https://env.test',
      model: 'env-model'
    });
    (GitService.getLatestTag as jest.Mock).mockResolvedValue({
      success: true,
      tag: 'v1.0.0'
    });

    const command = getTagCommand();

    await (command as any).handleTag('v1.1.0', {});

    expect(GitService.getLatestTag).toHaveBeenCalled();
    expect(AIService).toHaveBeenCalledWith({
      apiKey: 'env-key',
      baseURL: 'https://env.test',
      model: 'env-model'
    });
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.1.0', '- Updated dependencies');
  });
});
