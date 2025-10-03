import { Command } from 'commander';
import readline from 'readline';
import { GitService, GitDiffResult } from './git';
import { AIService, AIServiceConfig } from './ai';
import { ConfigService } from './config';

export interface CommitOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  push?: boolean;
  messageOnly?: boolean;
}

export class CommitCommand {
  private program: Command;

  constructor() {
    this.program = new Command('commit')
      .description('Generate AI-powered commit message')
      .option('-k, --api-key <key>', 'OpenAI API key (overrides env var)')
      .option('-b, --base-url <url>', 'Custom API base URL (overrides env var)')
      .option('--model <model>', 'Model to use (overrides env var)')
      .option('-m, --message-only', 'Output only the generated commit message and skip git actions')
      .option('-p, --push', 'Push current branch after creating the commit (implies --commit)')
      .action(this.handleCommit.bind(this));
  }

  private async handleCommit(options: CommitOptions) {
    try {
      const existingConfig = ConfigService.getConfig();

      const mergedApiKey = options.apiKey || existingConfig.apiKey;
      const mergedBaseURL = options.baseURL || existingConfig.baseURL;
      const mergedModel = options.model || existingConfig.model;
      const messageOnly = Boolean(options.messageOnly);

      const log = (...args: unknown[]) => {
        if (!messageOnly) {
          console.log(...args);
        }
      };

      ConfigService.validateConfig({
        apiKey: mergedApiKey,
        language: existingConfig.language
      });

      const aiConfig: AIServiceConfig = {
        apiKey: mergedApiKey!,
        baseURL: mergedBaseURL,
        model: mergedModel,
        language: existingConfig.language
      };

      log('Getting staged changes...');
      
      const diffResult: GitDiffResult = await GitService.getStagedDiff();
      
      if (!diffResult.success) {
        console.error('Error:', diffResult.error);
        process.exit(1);
      }

      log('Generating commit message...');
      
      const aiService = new AIService(aiConfig);
      const aiResult = await aiService.generateCommitMessage(diffResult.diff!);

      if (!aiResult.success) {
        console.error('Error:', aiResult.error);
        process.exit(1);
      }

      if (typeof aiResult.message !== 'string') {
        console.error('Error: Failed to generate commit message');
        process.exit(1);
      }

      if (messageOnly) {
        console.log(aiResult.message);
        return;
      }

      console.log('\nGenerated commit message:');
      console.log(aiResult.message);

      const confirmed = await this.confirmCommit();

      if (!confirmed) {
        console.log('Commit cancelled by user.');
        return;
      }

      console.log('\nCreating commit...');
      const commitSuccess = await GitService.createCommit(aiResult.message!);

      if (commitSuccess) {
        console.log('✅ Commit created successfully!');

        const pushRequested = Boolean(options.push);
        const pushFromConfig = !pushRequested && existingConfig.autoPush;
        const shouldPush = pushRequested || pushFromConfig;

        if (shouldPush) {
          if (pushFromConfig) {
            console.log('Auto push enabled in config; pushing to remote...');
          } else {
            console.log('Pushing to remote...');
          }

          const pushSuccess = await GitService.push();

          if (pushSuccess) {
            console.log('✅ Push completed successfully!');
          } else {
            console.error('❌ Failed to push to remote');
            process.exit(1);
          }
        }
      } else {
        console.error('❌ Failed to create commit');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async confirmCommit(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer: string = await new Promise(resolve => {
      rl.question('Proceed with git commit? (y/n): ', resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  getCommand(): Command {
    return this.program;
  }
}
