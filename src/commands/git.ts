import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const GIT_DIFF_MAX_BUFFER = 50 * 1024 * 1024;
const MAX_DIFF_TOKENS = 50000;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_DIFF_CHARS = MAX_DIFF_TOKENS * APPROX_CHARS_PER_TOKEN;
const MAX_FILE_LINES = 400;
const MAX_NEW_FILE_LINES = 200;

const splitDiffSections = (diff: string): string[] => {
  const lines = diff.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current.length > 0) {
        sections.push(current.join('\n'));
      }
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  return sections.length > 0 ? sections : [diff];
};

const truncateSection = (section: string): string => {
  const lines = section.split('\n');
  const isNewFile = section.includes('new file mode') || section.includes('--- /dev/null');
  const limit = isNewFile ? MAX_NEW_FILE_LINES : MAX_FILE_LINES;

  if (lines.length <= limit) {
    return section;
  }

  const omitted = lines.length - limit;
  const truncated = lines.slice(0, limit);
  truncated.push(`... (truncated ${omitted} lines)`);
  return truncated.join('\n');
};

const truncateDiffByFile = (diff: string): string => {
  const sections = splitDiffSections(diff);
  return sections.map(truncateSection).join('\n');
};

const truncateDiffByTotal = (diff: string): string => {
  const lines = diff.split('\n');
  let total = 0;
  const kept: string[] = [];

  for (const line of lines) {
    const addition = line.length + 1;
    if (total + addition > MAX_DIFF_CHARS) {
      break;
    }
    kept.push(line);
    total += addition;
  }

  if (kept.length === lines.length) {
    return diff;
  }

  kept.push(`... (truncated remaining diff to stay under ${MAX_DIFF_TOKENS} tokens)`);
  return kept.join('\n');
};

const truncateDiff = (diff: string): string => truncateDiffByTotal(truncateDiffByFile(diff));

export interface GitDiffResult {
  success: boolean;
  diff?: string;
  error?: string;
}

export interface GitTagResult {
  success: boolean;
  tag?: string;
  error?: string;
}

export interface GitLogResult {
  success: boolean;
  log?: string;
  error?: string;
}

export class GitService {
  static async getStagedDiff(): Promise<GitDiffResult> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--staged'], {
        maxBuffer: GIT_DIFF_MAX_BUFFER
      });
      const diff = truncateDiff(stdout);
      
      if (!diff.trim()) {
        return {
          success: false,
          error: 'No staged changes found. Please stage your changes first.'
        };
      }
      
      return {
        success: true,
        diff
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get git diff';
      return {
        success: false,
        error: message.includes('maxBuffer')
          ? 'Staged diff is too large to process. Try committing in smaller batches.'
          : message
      };
    }
  }

  static async getBranchDiff(base: string, compare: string): Promise<GitDiffResult> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', `${base}...${compare}`], {
        maxBuffer: GIT_DIFF_MAX_BUFFER
      });
      const diff = truncateDiff(stdout);

      if (!diff.trim()) {
        return {
          success: false,
          error: `No differences found between ${base} and ${compare}.`
        };
      }

      return {
        success: true,
        diff
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get branch diff';
      return {
        success: false,
        error: message.includes('maxBuffer')
          ? 'Diff is too large to process. Try narrowing the compare range.'
          : message.includes('unknown revision')
            ? `Unable to resolve one of the branches: ${base} or ${compare}.`
            : message
      };
    }
  }
  
  static async createCommit(message: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['commit', '-m', message]);
      return true;
    } catch (error) {
      console.error('Failed to create commit:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async push(): Promise<boolean> {
    try {
      await execFileAsync('git', ['push']);
      return true;
    } catch (error) {
      console.error('Failed to push to remote:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async pushTag(tagName: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', 'origin', tagName]);
      return true;
    } catch (error) {
      console.error('Failed to push tag to remote:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async getLatestTag(): Promise<GitTagResult> {
    try {
      const { stdout } = await execAsync('git describe --tags --abbrev=0');
      const tag = stdout.trim();

      if (!tag) {
        return {
          success: false,
          error: 'No tags found in the repository.'
        };
      }

      return {
        success: true,
        tag
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to determine the latest tag. Provide a base tag explicitly using --base-tag.'
      };
    }
  }

  static async getCommitSummariesSince(tag?: string): Promise<GitLogResult> {
    try {
      const logCommand = tag
        ? `git log ${tag}..HEAD --pretty=format:%s`
        : 'git log --pretty=format:%s';

      const { stdout } = await execAsync(logCommand);
      const trimmed = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (trimmed.length === 0) {
        return {
          success: false,
          error: tag
            ? `No commits found since tag ${tag}.`
            : 'No commits found in the repository.'
        };
      }

      const formattedLog = trimmed.map(entry => `- ${entry}`).join('\n');

      return {
        success: true,
        log: formattedLog
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read commit history.'
      };
    }
  }

  static async createAnnotatedTag(tagName: string, message: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['tag', '-a', tagName, '-m', message]);
      return true;
    } catch (error) {
      console.error('Failed to create tag:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async tagExists(tagName: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', `refs/tags/${tagName}`]);
      return true;
    } catch {
      return false;
    }
  }

  static async getTagMessage(tagName: string): Promise<string | null> {
    try {
      // Get the tag object content
      const { stdout } = await execFileAsync('git', ['tag', '-l', '-n999', tagName]);
      if (!stdout.trim()) {
        return null;
      }
      // Format: "tagname    message line 1\n            message line 2..."
      // Remove the tag name prefix and clean up
      const lines = stdout.split('\n');
      const firstLine = lines[0] || '';
      // Remove tag name from first line
      const messageStart = firstLine.replace(new RegExp(`^${tagName}\\s*`), '');
      const restLines = lines.slice(1).map(line => line.replace(/^\s{12}/, ''));
      return [messageStart, ...restLines].join('\n').trim() || null;
    } catch {
      return null;
    }
  }

  static async remoteTagExists(tagName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`git ls-remote --tags origin refs/tags/${tagName}`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  static async deleteLocalTag(tagName: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['tag', '-d', tagName]);
      return true;
    } catch (error) {
      console.error('Failed to delete local tag:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async deleteRemoteTag(tagName: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', 'origin', '--delete', tagName]);
      return true;
    } catch (error) {
      console.error('Failed to delete remote tag:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async forcePushTag(tagName: string, remote = 'origin'): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', remote, tagName, '--force']);
      return true;
    } catch (error) {
      console.error(`Failed to force push tag to ${remote}:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async getRemotes(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git remote');
      const remotes = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      return remotes;
    } catch {
      return [];
    }
  }

  static async pushTagToRemote(tagName: string, remote: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', remote, tagName]);
      return true;
    } catch (error) {
      console.error(`Failed to push tag to ${remote}:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async deleteRemoteTagFrom(tagName: string, remote: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', remote, '--delete', tagName]);
      return true;
    } catch (error) {
      console.error(`Failed to delete tag from ${remote}:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  static async remoteTagExistsOn(tagName: string, remote: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`git ls-remote --tags ${remote} refs/tags/${tagName}`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
