import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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
      const { stdout } = await execAsync('git diff --staged');
      
      if (!stdout.trim()) {
        return {
          success: false,
          error: 'No staged changes found. Please stage your changes first.'
        };
      }
      
      return {
        success: true,
        diff: stdout
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get git diff'
      };
    }
  }

  static async getBranchDiff(base: string, compare: string): Promise<GitDiffResult> {
    try {
      const command = `git diff ${base}...${compare}`;
      const { stdout } = await execAsync(command);

      if (!stdout.trim()) {
        return {
          success: false,
          error: `No differences found between ${base} and ${compare}.`
        };
      }

      return {
        success: true,
        diff: stdout
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get branch diff';
      return {
        success: false,
        error: message.includes('unknown revision')
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

  static async forcePushTag(tagName: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', 'origin', tagName, '--force']);
      return true;
    } catch (error) {
      console.error('Failed to force push tag to remote:', error instanceof Error ? error.message : error);
      return false;
    }
  }
}
