import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitDiffResult {
  success: boolean;
  diff?: string;
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
      await execAsync(`git commit -m "${message}"`);
      return true;
    } catch (error) {
      console.error('Failed to create commit:', error instanceof Error ? error.message : error);
      return false;
    }
  }
}