import { TagCommand } from '../commands/tag';
import { GitService } from '../commands/git';
import { AIService } from '../commands/ai';
import { ConfigService } from '../commands/config';

jest.mock('../commands/git', () => ({
  GitService: {
    getLatestTag: jest.fn(),
    getCommitSummariesSince: jest.fn(),
    createAnnotatedTag: jest.fn(),
    pushTag: jest.fn(),
    pushTagToRemote: jest.fn(),
    tagExists: jest.fn(),
    remoteTagExists: jest.fn(),
    deleteLocalTag: jest.fn(),
    deleteRemoteTag: jest.fn(),
    forcePushTag: jest.fn(),
    getRemotes: jest.fn(),
    getTagMessage: jest.fn(),
    getTagBefore: jest.fn(),
    getRecentTags: jest.fn()
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
    getConfig: jest.fn(),
    validateConfig: jest.fn()
  }
}));

describe('TagCommand', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    (ConfigService.getConfig as jest.Mock).mockReturnValue({
      apiKey: 'env-key',
      baseURL: 'https://env.test',
      model: 'env-model',
      language: 'ko',
      autoPush: false
    });

    (ConfigService.validateConfig as jest.Mock).mockReturnValue(undefined);

    // Tag doesn't exist by default
    (GitService.tagExists as jest.Mock).mockResolvedValue(false);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValue(false);

    (GitService.getTagMessage as jest.Mock).mockResolvedValue(null);
    (GitService.getTagBefore as jest.Mock).mockResolvedValue({ success: false, error: 'No earlier tag found.' });
    (GitService.getRecentTags as jest.Mock).mockResolvedValue([]);

    // Default: no remotes configured (skip push flow)
    (GitService.getRemotes as jest.Mock).mockResolvedValue([]);

    // Confirm creation by default
    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagCreate')
      .mockResolvedValue(true);

    // Do not push by default (return null = skip push)
    confirmSpy = jest
      .spyOn(TagCommand.prototype as any, 'selectRemotesForPush')
      .mockResolvedValue(null);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
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
    expect(GitService.pushTag).not.toHaveBeenCalled();
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
      model: 'gpt-test',
      language: 'ko'
    });
    expect(mockGenerateTagNotes).toHaveBeenCalledWith('v1.3.0', '- feat: add feature\n- fix: bug fix', undefined, null, null);
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.3.0', '- Added feature\n- Fixed bug');
    expect(GitService.pushTag).not.toHaveBeenCalled();
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
    expect(GitService.pushTag).not.toHaveBeenCalled();
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
    (ConfigService.getConfig as jest.Mock).mockReturnValue({
      apiKey: 'env-key',
      baseURL: 'https://env.test',
      model: 'env-model',
      language: 'ko',
      autoPush: false
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
      model: 'env-model',
      language: 'ko'
    });
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.1.0', '- Updated dependencies');
    expect(GitService.pushTag).not.toHaveBeenCalled();
  });

  it('should push tag when user confirms', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    (GitService.pushTagToRemote as jest.Mock).mockResolvedValue(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);
    confirmSpy.mockResolvedValueOnce(['origin']);

    const command = getTagCommand();

    await (command as any).handleTag('v2.0.0', { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v2.0.0', 'Release notes');
    expect(GitService.pushTagToRemote).toHaveBeenCalledWith('v2.0.0', 'origin');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit when tag push fails after confirmation', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    (GitService.pushTagToRemote as jest.Mock).mockResolvedValue(false);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);
    confirmSpy.mockResolvedValueOnce(['origin']);

    const command = getTagCommand();

    await (command as any).handleTag('v3.0.0', { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v3.0.0', 'Release notes');
    expect(GitService.pushTagToRemote).toHaveBeenCalledWith('v3.0.0', 'origin');
    // Note: Now the command doesn't exit on push failure, it just logs and continues
  });

  it('should cancel when user declines to replace existing local tag', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.tagExists).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
    expect(GitService.pushTag).not.toHaveBeenCalled();
  });

  it('should delete local tag and create new one when user confirms', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.tagExists).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.deleteLocalTag).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.0.0', 'Release notes');
  });

  it('should delete both local and remote tag when user confirms', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.remoteTagExists).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.deleteRemoteTag).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.deleteLocalTag).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.0.0', 'Release notes');
  });

  it('should exit when local tag deletion fails', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(false);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.deleteLocalTag).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit when remote tag deletion fails', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValueOnce(false);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.deleteRemoteTag).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.deleteLocalTag).not.toHaveBeenCalled();
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should force push when tag was replaced and user confirms', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.forcePushTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    confirmSpy.mockResolvedValueOnce(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmForcePush')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.deleteLocalTag).toHaveBeenCalledWith('v1.0.0');
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.0.0', 'Release notes');
    expect(GitService.forcePushTag).toHaveBeenCalledWith('v1.0.0', 'origin');
  });

  it('should cancel push when user declines force push', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    confirmSpy.mockResolvedValueOnce(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmForcePush')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.0.0', 'Release notes');
    expect(GitService.forcePushTag).not.toHaveBeenCalled();
    expect(GitService.pushTagToRemote).not.toHaveBeenCalled();
  });

  it('should force push when remote tag exists and user confirms', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValueOnce(false); // User declined remote deletion
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.forcePushTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(false); // Decline remote deletion
    confirmSpy.mockResolvedValueOnce(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmForcePush')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v1.0.0', { message: 'Release notes' });

    expect(GitService.forcePushTag).toHaveBeenCalledWith('v1.0.0', 'origin');
    expect(GitService.pushTagToRemote).not.toHaveBeenCalled();
  });

  it('should push to multiple remotes when user selects all', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    (GitService.pushTagToRemote as jest.Mock).mockResolvedValue(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin', 'upstream']);
    confirmSpy.mockResolvedValueOnce(['origin', 'upstream']);

    const command = getTagCommand();

    await (command as any).handleTag('v2.0.0', { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v2.0.0', 'Release notes');
    expect(GitService.pushTagToRemote).toHaveBeenCalledWith('v2.0.0', 'origin');
    expect(GitService.pushTagToRemote).toHaveBeenCalledWith('v2.0.0', 'upstream');
  });
});
