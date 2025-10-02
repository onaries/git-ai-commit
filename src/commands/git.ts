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
}
