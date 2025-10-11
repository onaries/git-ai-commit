import { Command } from 'commander';
import { GitService } from './git';
import { AIService } from './ai';
import { ConfigService } from './config';

export interface PullRequestOptions {
  base: string;
  compare: string;
  apiKey?: string;
  baseURL?: string;
  baseUrl?: string;
  model?: string;
}

export class PullRequestCommand {
  private program: Command;

  constructor() {
    this.program = new Command('pr')
      .description('Generate a pull request title and summary from branch differences')
      .requiredOption('--base <branch>', 'Base branch to diff against (e.g. main)')
      .requiredOption('--compare <branch>', 'Compare branch to describe (e.g. feature/my-change)')
      .option('-k, --api-key <key>', 'Override API key for this run')
      .option('-b, --base-url <url>', 'Override API base URL')
      .option('--model <model>', 'Override AI model for this run')
      .action(this.handlePullRequest.bind(this));
  }

  private async handlePullRequest(options: PullRequestOptions) {
    try {
      const existingConfig = ConfigService.getConfig();

      const mergedApiKey = options.apiKey || existingConfig.apiKey;
      const baseURLOverride = options.baseURL ?? options.baseUrl;
      const mergedBaseURL = baseURLOverride || existingConfig.baseURL;
      const mergedModel = options.model || existingConfig.model;

      ConfigService.validateConfig({
        apiKey: mergedApiKey,
        language: existingConfig.language
      });

      const diffResult = await GitService.getBranchDiff(options.base, options.compare);

      if (!diffResult.success || !diffResult.diff) {
        console.error('Error:', diffResult.error || 'Unable to determine differences between branches.');
        process.exit(1);
        return;
      }

      const aiService = new AIService({
        apiKey: mergedApiKey!,
        baseURL: mergedBaseURL,
        model: mergedModel,
        language: existingConfig.language,
        verbose: false
      });

      const aiResult = await aiService.generatePullRequestMessage(
        options.base,
        options.compare,
        diffResult.diff
      );

      if (!aiResult.success || !aiResult.message) {
        console.error('Error:', aiResult.error || 'Failed to generate pull request message.');
        process.exit(1);
        return;
      }

      console.log(aiResult.message);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  getCommand(): Command {
    return this.program;
  }
}
