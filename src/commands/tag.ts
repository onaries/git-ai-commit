import { Command } from 'commander';
import { AIService, AIServiceConfig } from './ai';
import { ConfigService } from './config';
import { GitService } from './git';

export interface TagOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  message?: string;
  baseTag?: string;
}

export class TagCommand {
  private program: Command;

  constructor() {
    this.program = new Command('tag')
      .description('Create an annotated git tag with optional AI-generated notes')
      .argument('<name>', 'Tag name to create')
      .option('-k, --api-key <key>', 'OpenAI API key (overrides env var)')
      .option('--base-url <url>', 'Custom API base URL (overrides env var)')
      .option('-m, --model <model>', 'Model to use (overrides env var)')
      .option('--message <message>', 'Tag message to use directly (skips AI generation)')
      .option('-t, --base-tag <tag>', 'Existing tag to diff against when generating notes')
      .action(async (tagName: string, options: TagOptions) => {
        await this.handleTag(tagName, options);
      });
  }

  private resolveAIConfig(options: TagOptions): AIServiceConfig {
    if (options.apiKey) {
      return {
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        model: options.model
      };
    }

    const envConfig = ConfigService.getEnvConfig();
    return {
      apiKey: envConfig.apiKey,
      baseURL: options.baseUrl || envConfig.baseURL,
      model: options.model || envConfig.model
    };
  }

  private async handleTag(tagName: string, options: TagOptions): Promise<void> {
    const trimmedName = tagName?.trim();

    if (!trimmedName) {
      console.error('Tag name is required.');
      process.exit(1);
      return;
    }

    let tagMessage = options.message?.trim();

    if (!tagMessage) {
      console.log('Collecting commit history for tag notes...');

      let baseTag = options.baseTag?.trim();
      if (!baseTag) {
        const latestTagResult = await GitService.getLatestTag();
        if (latestTagResult.success && latestTagResult.tag) {
          baseTag = latestTagResult.tag;
          console.log(`Using latest tag ${baseTag} as base.`);
        } else {
          console.log('No existing tag found; using entire commit history.');
        }
      }

      const historyResult = await GitService.getCommitSummariesSince(baseTag);
      if (!historyResult.success || !historyResult.log) {
        console.error('Error:', historyResult.error ?? 'Unable to read commit history.');
        process.exit(1);
        return;
      }

      let aiConfig: AIServiceConfig;

      try {
        aiConfig = this.resolveAIConfig(options);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
        return;
      }

      const aiService = new AIService(aiConfig);
      const aiResult = await aiService.generateTagNotes(trimmedName, historyResult.log);

      if (!aiResult.success || !aiResult.notes) {
        console.error('Error:', aiResult.error ?? 'Failed to generate tag notes.');
        process.exit(1);
        return;
      }

      tagMessage = aiResult.notes;
    }

    console.log(`Creating annotated tag ${trimmedName}...`);
    const created = await GitService.createAnnotatedTag(trimmedName, tagMessage);

    if (!created) {
      console.error('❌ Failed to create tag');
      process.exit(1);
      return;
    }

    console.log(`✅ Tag ${trimmedName} created successfully!`);
    console.log('\nTag message:\n');
    console.log(tagMessage);
  }

  getCommand(): Command {
    return this.program;
  }
}
