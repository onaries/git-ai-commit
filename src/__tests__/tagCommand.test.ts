import { TagCommand } from '../commands/tag';
import { GitService } from '../commands/git';
import { AIService } from '../commands/ai';
import { ConfigService } from '../commands/config';
import { Command } from 'commander';
import readline from 'readline';

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
  let exitSpy: jest.SpyInstance;
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (Object.values(GitService) as jest.Mock[]).forEach(mockFn => mockFn.mockReset());
    (ConfigService.getConfig as jest.Mock).mockReset();
    (ConfigService.validateConfig as jest.Mock).mockReset();
    mockGenerateTagNotes.mockReset();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

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
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    (GitService.pushTagToRemote as jest.Mock).mockResolvedValue(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValue(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValue(true);
    (GitService.forcePushTag as jest.Mock).mockResolvedValue(true);

    (GitService.getTagMessage as jest.Mock).mockResolvedValue(null);
    (GitService.getTagBefore as jest.Mock).mockResolvedValue({ success: false, error: 'No earlier tag found.' });
    (GitService.getRecentTags as jest.Mock).mockResolvedValue([]);
    (GitService.getLatestTag as jest.Mock).mockResolvedValue({ success: true, tag: 'v1.0.0' });

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
    jest.restoreAllMocks();
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
    expect(AIService).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-key',
      baseURL: 'https://api.test',
      model: 'gpt-test',
      language: 'ko'
    }));
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
    expect(AIService).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'env-key',
      baseURL: 'https://env.test',
      model: 'env-model',
      language: 'ko'
    }));
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

  it('should ask for force push when normal push fails and user declines', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    (GitService.pushTagToRemote as jest.Mock).mockResolvedValue(false);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);
    confirmSpy.mockResolvedValueOnce(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmForcePush')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('v3.0.0', { message: 'Release notes' });
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v3.0.0', 'Release notes');
    expect(GitService.pushTagToRemote).toHaveBeenCalledWith('v3.0.0', 'origin');
    expect(GitService.forcePushTag).not.toHaveBeenCalled();
  });

  it('should force push when normal push fails and user confirms', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);
    (GitService.pushTagToRemote as jest.Mock).mockResolvedValue(false);
    (GitService.forcePushTag as jest.Mock).mockResolvedValue(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);
    confirmSpy.mockResolvedValueOnce(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmForcePush')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v3.0.0', { message: 'Release notes' });
    expect(GitService.pushTagToRemote).toHaveBeenCalledWith('v3.0.0', 'origin');
    expect(GitService.forcePushTag).toHaveBeenCalledWith('v3.0.0', 'origin');
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
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.forcePushTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(false);
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
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValue(['origin']);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(false);
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

  it('should return commander command from getCommand', () => {
    const command = getTagCommand();

    const program = command.getCommand();

    expect(program).toBeInstanceOf(Command);
    expect(program.name()).toBe('tag');
  });

  it('should auto-increment patch from latest tag when name is omitted (v-prefixed)', async () => {
    (GitService.getLatestTag as jest.Mock).mockResolvedValueOnce({ success: true, tag: 'v1.2.3' });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag(undefined, { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v1.2.4', 'Release notes');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should auto-increment patch from latest tag when name is omitted (no v prefix)', async () => {
    (GitService.getLatestTag as jest.Mock).mockResolvedValueOnce({ success: true, tag: '1.2.3' });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag(undefined, { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('1.2.4', 'Release notes');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should auto-increment patch from latest tag when name is omitted (prefixed version)', async () => {
    (GitService.getLatestTag as jest.Mock).mockResolvedValueOnce({ success: true, tag: 'release-v1.2.3' });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag(undefined, { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('release-v1.2.4', 'Release notes');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit when no existing tags are found for auto-increment', async () => {
    (GitService.getLatestTag as jest.Mock).mockResolvedValueOnce({ success: false, error: 'No tags' });

    const command = getTagCommand();

    await (command as any).handleTag(undefined, { message: 'Release notes' });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should exit when latest tag cannot be parsed for auto-increment', async () => {
    (GitService.getLatestTag as jest.Mock).mockResolvedValueOnce({ success: true, tag: 'not-semver' });

    const command = getTagCommand();

    await (command as any).handleTag(undefined, { message: 'Release notes' });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should proceed when tag style mismatches and user confirms', async () => {
    (GitService.getRecentTags as jest.Mock).mockResolvedValueOnce(['v1.0.0', 'v1.0.1', 'v1.1.0']);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    const mismatchSpy = jest
      .spyOn(TagCommand.prototype as any, 'confirmStyleMismatch')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('release-1.2.0', { message: 'Release notes' });

    expect(mismatchSpy).toHaveBeenCalledTimes(1);
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('release-1.2.0', 'Release notes');
  });

  it('should cancel when tag style mismatches and user declines', async () => {
    (GitService.getRecentTags as jest.Mock).mockResolvedValueOnce(['v1.0.0', 'v1.0.1']);
    const mismatchSpy = jest
      .spyOn(TagCommand.prototype as any, 'confirmStyleMismatch')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('release-1.2.0', { message: 'Release notes' });

    expect(mismatchSpy).toHaveBeenCalledTimes(1);
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should not warn for style mismatch when pattern matches or there are not enough tags', async () => {
    const mismatchSpy = jest.spyOn(TagCommand.prototype as any, 'confirmStyleMismatch');
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(true);

    (GitService.getRecentTags as jest.Mock).mockResolvedValueOnce(['v1.0.0', 'v1.0.1']);
    const commandA = getTagCommand();
    await (commandA as any).handleTag('v1.0.2', { message: 'Release notes' });

    (GitService.getRecentTags as jest.Mock).mockResolvedValueOnce(['v1.0.0']);
    const commandB = getTagCommand();
    await (commandB as any).handleTag('release-1.0.1', { message: 'Release notes' });

    expect(mismatchSpy).not.toHaveBeenCalled();
    expect(GitService.createAnnotatedTag).toHaveBeenCalledTimes(2);
  });

  it('should delete remote tag when it exists remotely but not locally and user confirms', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v4.0.0', { message: 'Release notes' });

    expect(GitService.deleteRemoteTag).toHaveBeenCalledWith('v4.0.0');
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v4.0.0', 'Release notes');
  });

  it('should proceed without deleting remote when remote-only tag exists and user declines deletion', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('v4.0.0', { message: 'Release notes' });

    expect(GitService.deleteRemoteTag).not.toHaveBeenCalled();
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v4.0.0', 'Release notes');
  });

  it('should delete base tag and use older base when no commits since base tag', async () => {
    (GitService.getCommitSummariesSince as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: 'No commits found' })
      .mockResolvedValueOnce({ success: true, log: '- fix: hotfix' });
    (GitService.getTagBefore as jest.Mock).mockResolvedValueOnce({ success: true, tag: 'v1.9.0' });
    (GitService.tagExists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getTagMessage as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('older style message');
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    mockGenerateTagNotes.mockResolvedValueOnce({ success: true, notes: '- tag notes' });

    jest
      .spyOn(TagCommand.prototype as any, 'confirmBaseTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v2.0.0', { baseTag: 'v2.0.0-base' });

    expect(GitService.deleteLocalTag).toHaveBeenCalledWith('v2.0.0-base');
    expect(GitService.deleteRemoteTag).toHaveBeenCalledWith('v2.0.0-base');
    expect(GitService.getCommitSummariesSince).toHaveBeenLastCalledWith('v1.9.0');
    expect(mockGenerateTagNotes).toHaveBeenCalledWith('v2.0.0', '- fix: hotfix', undefined, null, 'older style message');
  });

  it('should exit when no commits since base tag and user declines deleting base tag', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'No commits found'
    });
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(false);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(false);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmBaseTagDelete')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('v2.0.0', { baseTag: 'v2.0.0-base' });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(GitService.getTagBefore).not.toHaveBeenCalled();
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should pass base tag message as style reference to AI when available', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValueOnce({
      success: true,
      log: '- feat: improve ux'
    });
    (GitService.getTagMessage as jest.Mock).mockResolvedValueOnce('release style reference');
    mockGenerateTagNotes.mockResolvedValueOnce({ success: true, notes: '- notes' });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    const command = getTagCommand();

    await (command as any).handleTag('v2.1.0', { baseTag: 'v2.0.0' });

    expect(GitService.getTagMessage).toHaveBeenCalledWith('v2.0.0');
    expect(mockGenerateTagNotes).toHaveBeenCalledWith(
      'v2.1.0',
      '- feat: improve ux',
      undefined,
      null,
      'release style reference'
    );
  });

  it('should continue with full history when base tag deletion local delete fails and no older tag exists', async () => {
    (GitService.getCommitSummariesSince as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: 'No commits found' })
      .mockResolvedValueOnce({ success: true, log: '- feat: fallback history' });
    (GitService.getTagBefore as jest.Mock).mockResolvedValueOnce({ success: false, error: 'No earlier tag found.' });
    (GitService.tagExists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(false);
    (GitService.remoteTagExists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (GitService.getTagMessage as jest.Mock)
      .mockResolvedValueOnce('base style')
      .mockResolvedValueOnce(null);
    mockGenerateTagNotes.mockResolvedValueOnce({ success: true, notes: '- generated notes' });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmBaseTagDelete')
      .mockResolvedValueOnce(true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const command = getTagCommand();

    await (command as any).handleTag('v2.4.0', { baseTag: 'v2.3.0' });

    expect(errorSpy).toHaveBeenCalledWith('❌ Failed to delete local tag v2.3.0');
    expect(GitService.getCommitSummariesSince).toHaveBeenLastCalledWith(undefined);
    expect(mockGenerateTagNotes).toHaveBeenCalledWith(
      'v2.4.0',
      '- feat: fallback history',
      undefined,
      null,
      null
    );
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v2.4.0', '- generated notes');
  });

  it('should log error when base tag remote deletion fails and continue generating notes', async () => {
    (GitService.getCommitSummariesSince as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: 'No commits found' })
      .mockResolvedValueOnce({ success: true, log: '- fix: recovered' });
    (GitService.getTagBefore as jest.Mock).mockResolvedValueOnce({ success: true, tag: 'v2.2.0' });
    (GitService.tagExists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (GitService.remoteTagExists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (GitService.deleteRemoteTag as jest.Mock).mockResolvedValueOnce(false);
    (GitService.getTagMessage as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('older style');
    mockGenerateTagNotes.mockResolvedValueOnce({ success: true, notes: '- generated notes' });
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);

    jest
      .spyOn(TagCommand.prototype as any, 'confirmBaseTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const command = getTagCommand();

    await (command as any).handleTag('v2.5.0', { baseTag: 'v2.4.0' });

    expect(errorSpy).toHaveBeenCalledWith('❌ Failed to delete remote tag v2.4.0');
    expect(GitService.getCommitSummariesSince).toHaveBeenLastCalledWith('v2.2.0');
    expect(GitService.createAnnotatedTag).toHaveBeenCalledWith('v2.5.0', '- generated notes');
  });

  it('should exit when resolveAIConfig throws', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValueOnce({
      success: true,
      log: '- feat: improve ux'
    });
    jest
      .spyOn(TagCommand.prototype as any, 'resolveAIConfig')
      .mockImplementationOnce(() => {
        throw new Error('Missing API key');
      });

    const command = getTagCommand();

    await (command as any).handleTag('v2.2.0', {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(AIService).not.toHaveBeenCalled();
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should exit when AI note generation fails', async () => {
    (GitService.getCommitSummariesSince as jest.Mock).mockResolvedValueOnce({
      success: true,
      log: '- feat: improve ux'
    });
    mockGenerateTagNotes.mockResolvedValueOnce({ success: false, error: 'AI failed' });

    const command = getTagCommand();

    await (command as any).handleTag('v2.3.0', {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should cancel when user declines final tag creation confirmation', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagCreate')
      .mockResolvedValueOnce(false);

    const command = getTagCommand();

    await (command as any).handleTag('v5.0.0', { message: 'Release notes' });

    expect(GitService.createAnnotatedTag).not.toHaveBeenCalled();
  });

  it('should exit when annotated tag creation fails', async () => {
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValue(false);

    const command = getTagCommand();

    await (command as any).handleTag('v5.1.0', { message: 'Release notes' });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should log error when force push fails in needsForcePush flow', async () => {
    (GitService.tagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.remoteTagExists as jest.Mock).mockResolvedValueOnce(true);
    (GitService.deleteLocalTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.createAnnotatedTag as jest.Mock).mockResolvedValueOnce(true);
    (GitService.getRemotes as jest.Mock).mockResolvedValueOnce(['origin']);
    (GitService.forcePushTag as jest.Mock).mockResolvedValueOnce(false);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmTagDelete')
      .mockResolvedValueOnce(true);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmRemoteTagDelete')
      .mockResolvedValueOnce(false);
    jest
      .spyOn(TagCommand.prototype as any, 'confirmForcePush')
      .mockResolvedValueOnce(true);
    confirmSpy.mockResolvedValueOnce(['origin']);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const command = getTagCommand();

    await (command as any).handleTag('v5.2.0', { message: 'Release notes' });

    expect(GitService.forcePushTag).toHaveBeenCalledWith('v5.2.0', 'origin');
    expect(errorSpy).toHaveBeenCalledWith('❌ Failed to force push tag to origin');
    errorSpy.mockRestore();
  });
});

describe('TagCommand confirmation methods (readline)', () => {
  const questionMock = jest.fn<void, [string, (answer: string) => void]>();
  const closeMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: questionMock,
      close: closeMock
    } as unknown as readline.Interface);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirmTagCreate returns true for yes-like answers and false for no', async () => {
    questionMock.mockImplementationOnce((_prompt, callback) => callback(' yes '));
    const command = new TagCommand();

    const yesResult = await (command as any).confirmTagCreate('v1.0.0');
    expect(yesResult).toBe(true);

    questionMock.mockImplementationOnce((_prompt, callback) => callback('n'));
    const noResult = await (command as any).confirmTagCreate('v1.0.1');
    expect(noResult).toBe(false);
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it('confirmTagDelete, confirmRemoteTagDelete, confirmBaseTagDelete, and confirmForcePush parse answers', async () => {
    questionMock
      .mockImplementationOnce((_prompt, callback) => callback('y'))
      .mockImplementationOnce((_prompt, callback) => callback(' no '))
      .mockImplementationOnce((_prompt, callback) => callback('yes'))
      .mockImplementationOnce((_prompt, callback) => callback('0'));

    const command = new TagCommand();

    await expect((command as any).confirmTagDelete('v1.0.0')).resolves.toBe(true);
    await expect((command as any).confirmRemoteTagDelete('v1.0.0')).resolves.toBe(false);
    await expect((command as any).confirmBaseTagDelete('v1.0.0')).resolves.toBe(true);
    await expect((command as any).confirmForcePush('v1.0.0')).resolves.toBe(false);
    expect(closeMock).toHaveBeenCalledTimes(4);
  });

  it('confirmStyleMismatch returns true for y and false for n', async () => {
    questionMock
      .mockImplementationOnce((_prompt, callback) => callback('y'))
      .mockImplementationOnce((_prompt, callback) => callback('n'));

    const command = new TagCommand();
    const mismatch = {
      newTag: 'release-1.2.0',
      newPattern: 'release-{n}.{n}.{n}',
      dominantPattern: 'v{n}.{n}.{n}',
      examples: ['v1.0.0', 'v1.0.1', 'v1.1.0']
    };

    await expect((command as any).confirmStyleMismatch(mismatch)).resolves.toBe(true);
    await expect((command as any).confirmStyleMismatch(mismatch)).resolves.toBe(false);
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it('selectRemotesForPush handles all, numbered, deduped, and invalid selections', async () => {
    questionMock
      .mockImplementationOnce((_prompt, callback) => callback('all'))
      .mockImplementationOnce((_prompt, callback) => callback('2,1,2'))
      .mockImplementationOnce((_prompt, callback) => callback(''))
      .mockImplementationOnce((_prompt, callback) => callback('7'));

    const command = new TagCommand();
    const remotes = ['origin', 'upstream', 'mirror'];

    await expect((command as any).selectRemotesForPush('v1.0.0', remotes)).resolves.toEqual(remotes);
    await expect((command as any).selectRemotesForPush('v1.0.0', remotes)).resolves.toEqual(['upstream', 'origin']);
    await expect((command as any).selectRemotesForPush('v1.0.0', remotes)).resolves.toBeNull();
    await expect((command as any).selectRemotesForPush('v1.0.0', remotes)).resolves.toBeNull();
    expect(closeMock).toHaveBeenCalledTimes(4);
  });
});
