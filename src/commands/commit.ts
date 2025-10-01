import { Command } from 'commander';
import readline from 'readline';
import { GitService, GitDiffResult } from './git';
import { AIService, AIServiceConfig } from './ai';
import { ConfigService } from './config';

export interface CommitOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  commit?: boolean;
  push?: boolean;
}

export class CommitCommand {
  private program: Command;

  constructor() {
    this.program = new Command('commit')
      .description('Generate AI-powered commit message')
      .option('-k, --api-key <key>', 'OpenAI API key (overrides env var)')
      .option('-b, --base-url <url>', 'Custom API base URL (overrides env var)')
      .option('-m, --model <model>', 'Model to use (overrides env var)')
      .option('-c, --commit', 'Automatically create commit with generated message')
      .option('-p, --push', 'Push current branch after creating the commit (implies --commit)')
      .action(this.handleCommit.bind(this));
  }

  private async handleCommit(options: CommitOptions) {
    try {
      let aiConfig: AIServiceConfig;
      
      if (options.apiKey) {
        aiConfig = {
          apiKey: options.apiKey,
          baseURL: options.baseURL,
          model: options.model
        };
      } else {
        const envConfig = ConfigService.getEnvConfig();
        aiConfig = {
          apiKey: envConfig.apiKey,
          baseURL: options.baseURL || envConfig.baseURL,
          model: options.model || envConfig.model
        };
      }

      ConfigService.validateConfig(aiConfig);

      console.log('Getting staged changes...');
      
      const diffResult: GitDiffResult = await GitService.getStagedDiff();
      
      if (!diffResult.success) {
        console.error('Error:', diffResult.error);
        process.exit(1);
      }

      console.log('Generating commit message...');
      
      const aiService = new AIService(aiConfig);
      const aiResult = await aiService.generateCommitMessage(diffResult.diff!);

      if (!aiResult.success) {
        console.error('Error:', aiResult.error);
        process.exit(1);
      }

      console.log('\nGenerated commit message:');
      console.log(aiResult.message);

      const shouldCommit = Boolean(options.commit || options.push);

      if (shouldCommit) {
        const confirmed = await this.confirmCommit();

        if (!confirmed) {
          console.log('Commit cancelled by user.');
          return;
        }

        console.log('\nCreating commit...');
        const commitSuccess = await GitService.createCommit(aiResult.message!);
        
        if (commitSuccess) {
          console.log('✅ Commit created successfully!');
          if (options.push) {
            console.log('Pushing to remote...');
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
