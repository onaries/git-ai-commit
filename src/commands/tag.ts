import { Command } from 'commander';
import readline from 'readline';
import { AIService, AIServiceConfig } from './ai';
import { ConfigService } from './config';
import { GitService } from './git';
import { LogService } from './log';

export interface TagOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  message?: string;
  baseTag?: string;
  prompt?: string;
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
      .option('--prompt <text>', 'Additional instructions to append to the AI prompt for this tag')
      .action(async (tagName: string, options: TagOptions) => {
        await this.handleTag(tagName, options);
      });
  }

  private resolveAIConfig(options: TagOptions): AIServiceConfig {
    const storedConfig = ConfigService.getConfig();

    const mergedApiKey = options.apiKey || storedConfig.apiKey;
    const mergedBaseURL = options.baseUrl || storedConfig.baseURL;
    const mergedModel = options.model || storedConfig.model;

    ConfigService.validateConfig({
      apiKey: mergedApiKey,
      language: storedConfig.language
    });

    return {
      apiKey: mergedApiKey!,
      baseURL: mergedBaseURL,
      model: mergedModel,
      language: storedConfig.language
    };
  }

  private async handleTag(tagName: string, options: TagOptions): Promise<void> {
    const trimmedName = tagName?.trim();

    if (!trimmedName) {
      console.error('Tag name is required.');
      await LogService.append({
        command: 'tag',
        args: { name: tagName, ...options, apiKey: options.apiKey ? '***' : undefined },
        status: 'failure',
        details: 'missing tag name'
      });
      process.exit(1);
      return;
    }

    // Check if tag already exists locally
    const localTagExists = await GitService.tagExists(trimmedName);
    let remoteTagExists = false;
    let wasTagReplaced = false;

    if (localTagExists) {
      console.log(`⚠️  Tag ${trimmedName} already exists locally.`);
      const shouldDelete = await this.confirmTagDelete(trimmedName);

      if (!shouldDelete) {
        console.log('Tag creation cancelled by user.');
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'cancelled',
          details: 'user declined to replace existing tag'
        });
        return;
      }

      // Check if tag exists on remote
      remoteTagExists = await GitService.remoteTagExists(trimmedName);

      if (remoteTagExists) {
        console.log(`⚠️  Tag ${trimmedName} also exists on remote.`);
        const shouldDeleteRemote = await this.confirmRemoteTagDelete(trimmedName);

        if (shouldDeleteRemote) {
          console.log(`Deleting remote tag ${trimmedName}...`);
          const remoteDeleted = await GitService.deleteRemoteTag(trimmedName);
          if (!remoteDeleted) {
            console.error('❌ Failed to delete remote tag');
            await LogService.append({
              command: 'tag',
              args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
              status: 'failure',
              details: 'remote tag deletion failed'
            });
            process.exit(1);
            return;
          }
          console.log(`✅ Remote tag ${trimmedName} deleted`);
          remoteTagExists = false;
        }
      }

      // Delete local tag
      console.log(`Deleting local tag ${trimmedName}...`);
      const localDeleted = await GitService.deleteLocalTag(trimmedName);
      if (!localDeleted) {
        console.error('❌ Failed to delete local tag');
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: 'local tag deletion failed'
        });
        process.exit(1);
        return;
      }
      console.log(`✅ Local tag ${trimmedName} deleted`);
      wasTagReplaced = true;
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
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: historyResult.error ?? 'Unable to read commit history.'
        });
        process.exit(1);
        return;
      }

      let aiConfig: AIServiceConfig;

      try {
        aiConfig = this.resolveAIConfig(options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error:', message);
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: message
        });
        process.exit(1);
        return;
      }

      const aiService = new AIService(aiConfig);
      const aiResult = await aiService.generateTagNotes(trimmedName, historyResult.log, options.prompt);

      if (!aiResult.success || !aiResult.notes) {
        console.error('Error:', aiResult.error ?? 'Failed to generate tag notes.');
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: aiResult.error ?? 'Failed to generate tag notes.'
        });
        process.exit(1);
        return;
      }

      tagMessage = aiResult.notes;
    }

    // Show preview and confirm before creating the tag
    console.log('\nTag message preview:\n');
    console.log(tagMessage);

    const shouldCreate = await this.confirmTagCreate(trimmedName);

    if (!shouldCreate) {
      console.log('Tag creation cancelled by user.');
      await LogService.append({
        command: 'tag',
        args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
        status: 'cancelled',
        details: 'user declined tag creation'
      });
      return;
    }

    console.log(`Creating annotated tag ${trimmedName}...`);
    const created = await GitService.createAnnotatedTag(trimmedName, tagMessage);

    if (!created) {
      console.error('❌ Failed to create tag');
      await LogService.append({
        command: 'tag',
        args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
        status: 'failure',
        details: 'git tag creation failed'
      });
      process.exit(1);
      return;
    }

    console.log(`✅ Tag ${trimmedName} created successfully!`);

    const shouldPush = await this.confirmTagPush(trimmedName);

    if (shouldPush) {
      // If tag was replaced or remote tag still exists, use force push
      const needsForcePush = wasTagReplaced || remoteTagExists;

      if (needsForcePush) {
        console.log(`⚠️  Tag ${trimmedName} exists on remote. Force push is required.`);
        const shouldForcePush = await this.confirmForcePush(trimmedName);

        if (!shouldForcePush) {
          console.log('Tag push cancelled by user.');
          await LogService.append({
            command: 'tag',
            args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
            status: 'cancelled',
            details: 'user declined force push'
          });
          return;
        }

        console.log(`Force pushing tag ${trimmedName} to remote...`);
        const pushSuccess = await GitService.forcePushTag(trimmedName);

        if (pushSuccess) {
          console.log(`✅ Tag ${trimmedName} force pushed successfully!`);
        } else {
          console.error('❌ Failed to force push tag to remote');
          await LogService.append({
            command: 'tag',
            args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
            status: 'failure',
            details: 'tag force push failed'
          });
          process.exit(1);
        }
      } else {
        console.log(`Pushing tag ${trimmedName} to remote...`);
        const pushSuccess = await GitService.pushTag(trimmedName);

        if (pushSuccess) {
          console.log(`✅ Tag ${trimmedName} pushed successfully!`);
        } else {
          console.error('❌ Failed to push tag to remote');
          await LogService.append({
            command: 'tag',
            args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
            status: 'failure',
            details: 'tag push failed'
          });
          process.exit(1);
        }
      }
    }

    await LogService.append({
      command: 'tag',
      args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
      status: 'success'
    });
  }

  private async confirmTagPush(tagName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer: string = await new Promise(resolve => {
      rl.question(`Push tag ${tagName} to remote? (y/n): `, resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  private async confirmTagCreate(tagName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer: string = await new Promise(resolve => {
      rl.question(`Create annotated tag ${tagName}? (y/n): `, resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  private async confirmTagDelete(tagName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer: string = await new Promise(resolve => {
      rl.question(`Delete existing tag ${tagName} and create a new one? (y/n): `, resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  private async confirmRemoteTagDelete(tagName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer: string = await new Promise(resolve => {
      rl.question(`Also delete remote tag ${tagName}? (y/n): `, resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  private async confirmForcePush(tagName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer: string = await new Promise(resolve => {
      rl.question(`Force push tag ${tagName} to remote? (y/n): `, resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  getCommand(): Command {
    return this.program;
  }
}
