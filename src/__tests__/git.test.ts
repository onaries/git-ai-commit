import { exec, execFile } from 'child_process';
import { GitService } from '../commands/git';

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execFile: jest.fn()
}));

type ExecResult = { stdout: string; stderr: string };
type MockCallback = (error: Error | null, result?: ExecResult) => void;

const mockExec = exec as unknown as jest.Mock;
const mockExecFile = execFile as unknown as jest.Mock;

const callbackFrom = (args: unknown[]): MockCallback => {
  const callback = args[args.length - 1];
  return callback as MockCallback;
};

const resolveExec = (stdout = ''): void => {
  mockExec.mockImplementationOnce((...args: unknown[]) => {
    callbackFrom(args)(null, { stdout, stderr: '' });
  });
};

const rejectExec = (message: string): void => {
  mockExec.mockImplementationOnce((...args: unknown[]) => {
    callbackFrom(args)(new Error(message));
  });
};

const resolveExecFile = (stdout = ''): void => {
  mockExecFile.mockImplementationOnce((...args: unknown[]) => {
    callbackFrom(args)(null, { stdout, stderr: '' });
  });
};

const rejectExecFile = (message: string): void => {
  mockExecFile.mockImplementationOnce((...args: unknown[]) => {
    callbackFrom(args)(new Error(message));
  });
};

const buildSection = (name: string, bodyLines: number, newFile = false): string => {
  const header = [
    `diff --git a/${name} b/${name}`,
    'index 1111111..2222222 100644',
    newFile ? 'new file mode 100644' : '--- a/file',
    newFile ? '--- /dev/null' : '+++ b/file',
    newFile ? '+++ b/file' : '@@ -1,1 +1,1 @@'
  ];

  const body = Array.from({ length: bodyLines }, (_, index) => `+line-${index + 1}`);
  return [...header, ...body].join('\n');
};

describe('GitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getStagedDiff', () => {
    it('returns success with diff when staged changes exist', async () => {
      resolveExecFile('diff --git a/a.ts b/a.ts\n+ok\n');

      const result = await GitService.getStagedDiff();

      expect(mockExecFile).toHaveBeenCalledWith('git', ['diff', '--staged'], {
        maxBuffer: 50 * 1024 * 1024
      }, expect.any(Function));
      expect(result).toEqual({
        success: true,
        diff: 'diff --git a/a.ts b/a.ts\n+ok\n'
      });
    });

    it('returns error when staged diff is empty', async () => {
      resolveExecFile('   \n');

      const result = await GitService.getStagedDiff();

      expect(result).toEqual({
        success: false,
        error: 'No staged changes found. Please stage your changes first.'
      });
    });

    it('returns maxBuffer friendly error', async () => {
      rejectExecFile('stdout maxBuffer length exceeded');

      const result = await GitService.getStagedDiff();

      expect(result).toEqual({
        success: false,
        error: 'Staged diff is too large to process. Try committing in smaller batches.'
      });
    });

    it('returns command error message', async () => {
      rejectExecFile('fatal: bad object');

      const result = await GitService.getStagedDiff();

      expect(result).toEqual({ success: false, error: 'fatal: bad object' });
    });

    it('splits and truncates each section independently for multiple files', async () => {
      const firstSection = buildSection('a.ts', 500, false);
      const secondSection = buildSection('b.ts', 10, false);
      resolveExecFile(`${firstSection}\n${secondSection}`);

      const result = await GitService.getStagedDiff();

      expect(result.success).toBe(true);
      expect(result.diff).toContain('diff --git a/a.ts b/a.ts');
      expect(result.diff).toContain('diff --git a/b.ts b/b.ts');
      expect(result.diff).toContain('... (truncated');
      expect(result.diff).toContain('+line-10');
      expect(result.diff).not.toContain('+line-500');
    });

    it('treats a single section without diff header as one section', async () => {
      const singleSection = Array.from({ length: 450 }, (_, index) => `line-${index + 1}`).join('\n');
      resolveExecFile(singleSection);

      const result = await GitService.getStagedDiff();

      expect(result.success).toBe(true);
      expect(result.diff).toContain('... (truncated');
      expect(result.diff).not.toContain('line-450');
    });

    it('applies stricter new-file truncation limit', async () => {
      resolveExecFile(buildSection('new-file.ts', 260, true));

      const result = await GitService.getStagedDiff();

      expect(result.success).toBe(true);
      expect(result.diff).toContain('... (truncated');
      expect(result.diff).not.toContain('+line-260');
    });

    it('applies total diff truncation when overall chars exceed limit', async () => {
      const longLine = `+${'x'.repeat(120)}`;
      const sections = Array.from({ length: 1200 }, (_, index) => {
        return [
          `diff --git a/file-${index}.ts b/file-${index}.ts`,
          '@@ -1,1 +1,1 @@',
          longLine
        ].join('\n');
      }).join('\n');
      resolveExecFile(sections);

      const result = await GitService.getStagedDiff();

      expect(result.success).toBe(true);
      expect(result.diff).toContain('... (truncated remaining diff to stay under 50000 tokens)');
      expect(result.diff!.length).toBeLessThan(sections.length);
    });
  });

  describe('getBranchDiff', () => {
    it('returns success with branch diff', async () => {
      resolveExecFile('diff --git a/a.ts b/a.ts\n+change');

      const result = await GitService.getBranchDiff('main', 'feature');

      expect(mockExecFile).toHaveBeenCalledWith('git', ['diff', 'main...feature'], {
        maxBuffer: 50 * 1024 * 1024
      }, expect.any(Function));
      expect(result).toEqual({ success: true, diff: 'diff --git a/a.ts b/a.ts\n+change' });
    });

    it('returns error when no differences are found', async () => {
      resolveExecFile('\n');

      const result = await GitService.getBranchDiff('main', 'feature');

      expect(result).toEqual({
        success: false,
        error: 'No differences found between main and feature.'
      });
    });

    it('returns maxBuffer friendly error', async () => {
      rejectExecFile('maxBuffer exceeded while reading');

      const result = await GitService.getBranchDiff('main', 'feature');

      expect(result).toEqual({
        success: false,
        error: 'Diff is too large to process. Try narrowing the compare range.'
      });
    });

    it('returns unknown revision friendly error', async () => {
      rejectExecFile('fatal: unknown revision or path not in the working tree');

      const result = await GitService.getBranchDiff('main', 'missing');

      expect(result).toEqual({
        success: false,
        error: 'Unable to resolve one of the branches: main or missing.'
      });
    });

    it('returns raw command error when not mapped', async () => {
      rejectExecFile('fatal: unexpected failure');

      const result = await GitService.getBranchDiff('main', 'feature');

      expect(result).toEqual({ success: false, error: 'fatal: unexpected failure' });
    });
  });

  describe('commit and push operations', () => {
    it('createCommit succeeds', async () => {
      resolveExecFile();
      await expect(GitService.createCommit('feat: message')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['commit', '-m', 'feat: message'], expect.any(Function));
    });

    it('createCommit fails', async () => {
      rejectExecFile('commit failed');
      await expect(GitService.createCommit('feat: message')).resolves.toBe(false);
    });

    it('push succeeds', async () => {
      resolveExecFile();
      await expect(GitService.push()).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push'], expect.any(Function));
    });

    it('push fails', async () => {
      rejectExecFile('push failed');
      await expect(GitService.push()).resolves.toBe(false);
    });

    it('pushTag succeeds', async () => {
      resolveExecFile();
      await expect(GitService.pushTag('v1.0.0')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push', 'origin', 'v1.0.0'], expect.any(Function));
    });

    it('pushTag fails', async () => {
      rejectExecFile('push tag failed');
      await expect(GitService.pushTag('v1.0.0')).resolves.toBe(false);
    });
  });

  describe('tag discovery and commit history', () => {
    it('getLatestTag succeeds with a tag', async () => {
      resolveExec('v2.3.4\n');
      await expect(GitService.getLatestTag()).resolves.toEqual({ success: true, tag: 'v2.3.4' });
      expect(mockExec).toHaveBeenCalledWith('git describe --tags --abbrev=0', expect.any(Function));
    });

    it('getLatestTag returns empty tag error', async () => {
      resolveExec('\n');
      await expect(GitService.getLatestTag()).resolves.toEqual({
        success: false,
        error: 'No tags found in the repository.'
      });
    });

    it('getLatestTag returns fallback error on failure', async () => {
      rejectExec('describe failed');
      await expect(GitService.getLatestTag()).resolves.toEqual({
        success: false,
        error: 'Failed to determine the latest tag. Provide a base tag explicitly using --base-tag.'
      });
    });

    it('getRecentTags parses output', async () => {
      resolveExec('v3.0.0\n\nv2.9.0\n');
      await expect(GitService.getRecentTags(2)).resolves.toEqual(['v3.0.0', 'v2.9.0']);
      expect(mockExec).toHaveBeenCalledWith('git tag --sort=-creatordate | head -n 2', expect.any(Function));
    });

    it('getRecentTags returns empty array on error', async () => {
      rejectExec('recent tags failed');
      await expect(GitService.getRecentTags()).resolves.toEqual([]);
    });

    it('getTagBefore returns earlier tag', async () => {
      resolveExec('abc123\n');
      resolveExec('v1.9.0\n');

      await expect(GitService.getTagBefore('v2.0.0')).resolves.toEqual({ success: true, tag: 'v1.9.0' });
      expect(mockExec).toHaveBeenNthCalledWith(1, 'git rev-list -n 1 v2.0.0', expect.any(Function));
      expect(mockExec).toHaveBeenNthCalledWith(2, 'git describe --tags --abbrev=0 abc123~1', expect.any(Function));
    });

    it('getTagBefore returns error when commit is empty', async () => {
      resolveExec('  \n');
      await expect(GitService.getTagBefore('v2.0.0')).resolves.toEqual({
        success: false,
        error: 'Could not resolve tag to a commit.'
      });
    });

    it('getTagBefore returns error when earlier tag is empty', async () => {
      resolveExec('abc123\n');
      resolveExec('\n');
      await expect(GitService.getTagBefore('v2.0.0')).resolves.toEqual({
        success: false,
        error: 'No earlier tag found.'
      });
    });

    it('getTagBefore returns fallback error on exception', async () => {
      rejectExec('rev-list failed');
      await expect(GitService.getTagBefore('v2.0.0')).resolves.toEqual({
        success: false,
        error: 'No earlier tag found.'
      });
    });

    it('getCommitSummariesSince with tag succeeds', async () => {
      resolveExec('fix: issue\nfeat: new\n');
      await expect(GitService.getCommitSummariesSince('v1.0.0')).resolves.toEqual({
        success: true,
        log: '- fix: issue\n- feat: new'
      });
      expect(mockExec).toHaveBeenCalledWith('git log v1.0.0..HEAD --pretty=format:%s', expect.any(Function));
    });

    it('getCommitSummariesSince without tag succeeds', async () => {
      resolveExec('chore: update\n');
      await expect(GitService.getCommitSummariesSince()).resolves.toEqual({
        success: true,
        log: '- chore: update'
      });
      expect(mockExec).toHaveBeenCalledWith('git log --pretty=format:%s', expect.any(Function));
    });

    it('getCommitSummariesSince returns empty result error with tag', async () => {
      resolveExec('\n\n');
      await expect(GitService.getCommitSummariesSince('v1.0.0')).resolves.toEqual({
        success: false,
        error: 'No commits found since tag v1.0.0.'
      });
    });

    it('getCommitSummariesSince returns empty result error without tag', async () => {
      resolveExec('   \n');
      await expect(GitService.getCommitSummariesSince()).resolves.toEqual({
        success: false,
        error: 'No commits found in the repository.'
      });
    });

    it('getCommitSummariesSince returns thrown error message', async () => {
      rejectExec('log failed');
      await expect(GitService.getCommitSummariesSince('v1.0.0')).resolves.toEqual({
        success: false,
        error: 'log failed'
      });
    });
  });

  describe('tag mutation methods', () => {
    it('createAnnotatedTag succeeds', async () => {
      resolveExecFile();
      await expect(GitService.createAnnotatedTag('v1.0.0', 'release')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['tag', '-a', 'v1.0.0', '-m', 'release'], expect.any(Function));
    });

    it('createAnnotatedTag fails', async () => {
      rejectExecFile('tag failed');
      await expect(GitService.createAnnotatedTag('v1.0.0', 'release')).resolves.toBe(false);
    });

    it('tagExists returns true when ref exists', async () => {
      resolveExecFile();
      await expect(GitService.tagExists('v1.0.0')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', 'refs/tags/v1.0.0'], expect.any(Function));
    });

    it('tagExists returns false when ref does not exist', async () => {
      rejectExecFile('not found');
      await expect(GitService.tagExists('v1.0.0')).resolves.toBe(false);
    });

    it('getTagMessage returns cleaned multiline message', async () => {
      resolveExecFile('v1.0.0    Release line 1\n            line 2\n            line 3\n');

      await expect(GitService.getTagMessage('v1.0.0')).resolves.toBe('Release line 1\nline 2\nline 3');
      expect(mockExecFile).toHaveBeenCalledWith('git', ['tag', '-l', '-n999', 'v1.0.0'], expect.any(Function));
    });

    it('getTagMessage returns null for empty output', async () => {
      resolveExecFile('  \n');
      await expect(GitService.getTagMessage('v1.0.0')).resolves.toBeNull();
    });

    it('getTagMessage returns null on error', async () => {
      rejectExecFile('tag message failed');
      await expect(GitService.getTagMessage('v1.0.0')).resolves.toBeNull();
    });

    it('remoteTagExists returns true when found on origin', async () => {
      resolveExec('abc refs/tags/v1.0.0\n');
      await expect(GitService.remoteTagExists('v1.0.0')).resolves.toBe(true);
      expect(mockExec).toHaveBeenCalledWith('git ls-remote --tags origin refs/tags/v1.0.0', expect.any(Function));
    });

    it('remoteTagExists returns false when missing on origin', async () => {
      resolveExec('\n');
      await expect(GitService.remoteTagExists('v1.0.0')).resolves.toBe(false);
    });

    it('remoteTagExists returns false on error', async () => {
      rejectExec('ls-remote failed');
      await expect(GitService.remoteTagExists('v1.0.0')).resolves.toBe(false);
    });

    it('deleteLocalTag succeeds', async () => {
      resolveExecFile();
      await expect(GitService.deleteLocalTag('v1.0.0')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['tag', '-d', 'v1.0.0'], expect.any(Function));
    });

    it('deleteLocalTag fails', async () => {
      rejectExecFile('delete local failed');
      await expect(GitService.deleteLocalTag('v1.0.0')).resolves.toBe(false);
    });

    it('deleteRemoteTag succeeds', async () => {
      resolveExecFile();
      await expect(GitService.deleteRemoteTag('v1.0.0')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push', 'origin', '--delete', 'v1.0.0'], expect.any(Function));
    });

    it('deleteRemoteTag fails', async () => {
      rejectExecFile('delete remote failed');
      await expect(GitService.deleteRemoteTag('v1.0.0')).resolves.toBe(false);
    });

    it('forcePushTag succeeds with default remote', async () => {
      resolveExecFile();
      await expect(GitService.forcePushTag('v1.0.0')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push', 'origin', 'v1.0.0', '--force'], expect.any(Function));
    });

    it('forcePushTag succeeds with custom remote', async () => {
      resolveExecFile();
      await expect(GitService.forcePushTag('v1.0.0', 'upstream')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push', 'upstream', 'v1.0.0', '--force'], expect.any(Function));
    });

    it('forcePushTag fails', async () => {
      rejectExecFile('force push failed');
      await expect(GitService.forcePushTag('v1.0.0')).resolves.toBe(false);
    });

    it('getRemotes returns remote names', async () => {
      resolveExec('origin\nupstream\n\n');
      await expect(GitService.getRemotes()).resolves.toEqual(['origin', 'upstream']);
      expect(mockExec).toHaveBeenCalledWith('git remote', expect.any(Function));
    });

    it('getRemotes returns empty array on error', async () => {
      rejectExec('remote failed');
      await expect(GitService.getRemotes()).resolves.toEqual([]);
    });

    it('pushTagToRemote succeeds', async () => {
      resolveExecFile();
      await expect(GitService.pushTagToRemote('v1.0.0', 'upstream')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push', 'upstream', 'v1.0.0'], expect.any(Function));
    });

    it('pushTagToRemote fails', async () => {
      rejectExecFile('push to remote failed');
      await expect(GitService.pushTagToRemote('v1.0.0', 'upstream')).resolves.toBe(false);
    });

    it('deleteRemoteTagFrom succeeds', async () => {
      resolveExecFile();
      await expect(GitService.deleteRemoteTagFrom('v1.0.0', 'upstream')).resolves.toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['push', 'upstream', '--delete', 'v1.0.0'], expect.any(Function));
    });

    it('deleteRemoteTagFrom fails', async () => {
      rejectExecFile('delete from remote failed');
      await expect(GitService.deleteRemoteTagFrom('v1.0.0', 'upstream')).resolves.toBe(false);
    });

    it('remoteTagExistsOn returns true when tag exists', async () => {
      resolveExec('abc refs/tags/v1.0.0\n');
      await expect(GitService.remoteTagExistsOn('v1.0.0', 'upstream')).resolves.toBe(true);
      expect(mockExec).toHaveBeenCalledWith('git ls-remote --tags upstream refs/tags/v1.0.0', expect.any(Function));
    });

    it('remoteTagExistsOn returns false when tag does not exist', async () => {
      resolveExec('   \n');
      await expect(GitService.remoteTagExistsOn('v1.0.0', 'upstream')).resolves.toBe(false);
    });

    it('remoteTagExistsOn returns false on error', async () => {
      rejectExec('ls-remote upstream failed');
      await expect(GitService.remoteTagExistsOn('v1.0.0', 'upstream')).resolves.toBe(false);
    });
  });
});
