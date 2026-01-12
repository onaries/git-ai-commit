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
      .argument('[name]', 'Tag name to create (auto-increments patch version if omitted)')
      .option('-k, --api-key <key>', 'OpenAI API key (overrides env var)')
      .option('--base-url <url>', 'Custom API base URL (overrides env var)')
      .option('-m, --model <model>', 'Model to use (overrides env var)')
      .option('--message <message>', 'Tag message to use directly (skips AI generation)')
      .option('-t, --base-tag <tag>', 'Existing tag to diff against when generating notes')
      .option('--prompt <text>', 'Additional instructions to append to the AI prompt for this tag')
      .action(async (tagName: string | undefined, options: TagOptions) => {
        await this.handleTag(tagName, options);
      });
  }

  private incrementPatchVersion(version: string): string | null {
    // Match semver patterns: v1.2.3, 1.2.3, prefix-v1.2.3, prefix-1.2.3, etc.
    const match = version.match(/^(.*?-?)?(v?)(\d+)\.(\d+)\.(\d+)(.*)$/);
    if (!match) {
      return null;
    }
    const [, prefix = '', v = '', major, minor, patch, suffix = ''] = match;
    const newPatch = parseInt(patch, 10) + 1;
    return `${prefix}${v}${major}.${minor}.${newPatch}${suffix}`;
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

  private async handleTag(tagName: string | undefined, options: TagOptions): Promise<void> {
    const storedConfig = ConfigService.getConfig();
    const mergedModel = options.model || storedConfig.model;

    let trimmedName = tagName?.trim();

    // If no tag name provided, auto-increment from latest tag
    if (!trimmedName) {
      const latestTagResult = await GitService.getLatestTag();
      
      if (!latestTagResult.success || !latestTagResult.tag) {
        console.error('No existing tags found. Please provide a tag name explicitly.');
        await LogService.append({
          command: 'tag',
          args: { ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: 'no existing tags found for auto-increment',
          model: mergedModel
        });
        process.exit(1);
        return;
      }

      const newVersion = this.incrementPatchVersion(latestTagResult.tag);
      
      if (!newVersion) {
        console.error(`Cannot parse version from tag "${latestTagResult.tag}". Please provide a tag name explicitly.`);
        await LogService.append({
          command: 'tag',
          args: { ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: `cannot parse version from tag: ${latestTagResult.tag}`,
          model: mergedModel
        });
        process.exit(1);
        return;
      }

      console.log(`Latest tag: ${latestTagResult.tag}`);
      console.log(`New tag: ${newVersion}`);
      trimmedName = newVersion;
    }

    // Check if tag already exists locally
    const localTagExists = await GitService.tagExists(trimmedName);
    let remoteTagExists = false;
    let previousTagMessage: string | null = null;

    if (localTagExists) {
      // Get existing tag message before deletion for reference
      previousTagMessage = await GitService.getTagMessage(trimmedName);
      
      console.log(`⚠️  Tag ${trimmedName} already exists locally.`);
      const shouldDelete = await this.confirmTagDelete(trimmedName);

      if (!shouldDelete) {
        console.log('Tag creation cancelled by user.');
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'cancelled',
          details: 'user declined to replace existing tag',
          model: mergedModel
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
              details: 'remote tag deletion failed',
              model: mergedModel
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
          details: 'local tag deletion failed',
          model: mergedModel
        });
        process.exit(1);
        return;
      }
      console.log(`✅ Local tag ${trimmedName} deleted`);
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

      // Get style reference from base tag (if different from current tag being replaced)
      let styleReferenceMessage: string | null = null;
      if (baseTag && baseTag !== trimmedName) {
        styleReferenceMessage = await GitService.getTagMessage(baseTag);
        if (styleReferenceMessage) {
          console.log(`Using ${baseTag} message as style reference.`);
        }
      }

      const historyResult = await GitService.getCommitSummariesSince(baseTag);
      if (!historyResult.success || !historyResult.log) {
        console.error('Error:', historyResult.error ?? 'Unable to read commit history.');
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: historyResult.error ?? 'Unable to read commit history.',
          model: mergedModel
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
          details: message,
          model: mergedModel
        });
        process.exit(1);
        return;
      }

      const aiService = new AIService(aiConfig);
      const aiResult = await aiService.generateTagNotes(
        trimmedName, 
        historyResult.log, 
        options.prompt, 
        previousTagMessage,
        styleReferenceMessage
      );

      if (!aiResult.success || !aiResult.notes) {
        console.error('Error:', aiResult.error ?? 'Failed to generate tag notes.');
        await LogService.append({
          command: 'tag',
          args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
          status: 'failure',
          details: aiResult.error ?? 'Failed to generate tag notes.',
          model: mergedModel
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
        details: 'user declined tag creation',
        model: mergedModel
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
        details: 'git tag creation failed',
        model: mergedModel
      });
      process.exit(1);
      return;
    }

    console.log(`✅ Tag ${trimmedName} created successfully!`);

    // Get available remotes
    const remotes = await GitService.getRemotes();

    if (remotes.length === 0) {
      console.log('No remotes configured. Skipping push.');
    } else {
      const selectedRemotes = await this.selectRemotesForPush(trimmedName, remotes);

      if (selectedRemotes && selectedRemotes.length > 0) {
        // If remote tag still exists (user declined to delete), use force push
        const needsForcePush = remoteTagExists;

        if (needsForcePush) {
          console.log(`\n⚠️  Tag ${trimmedName} may exist on remote. Force push is required.`);
          const shouldForcePush = await this.confirmForcePush(trimmedName);

          if (!shouldForcePush) {
            console.log('Tag push cancelled by user.');
            await LogService.append({
              command: 'tag',
              args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
              status: 'cancelled',
              details: 'user declined force push',
              model: mergedModel
            });
            return;
          }

          for (const remote of selectedRemotes) {
            console.log(`Force pushing tag ${trimmedName} to ${remote}...`);
            const pushSuccess = await GitService.forcePushTag(trimmedName, remote);

            if (pushSuccess) {
              console.log(`✅ Tag ${trimmedName} force pushed to ${remote} successfully!`);
            } else {
              console.error(`❌ Failed to force push tag to ${remote}`);
              await LogService.append({
                command: 'tag',
                args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
                status: 'failure',
                details: `tag force push to ${remote} failed`,
                model: mergedModel
              });
            }
          }
        } else {
          for (const remote of selectedRemotes) {
            console.log(`Pushing tag ${trimmedName} to ${remote}...`);
            const pushSuccess = await GitService.pushTagToRemote(trimmedName, remote);

            if (pushSuccess) {
              console.log(`✅ Tag ${trimmedName} pushed to ${remote} successfully!`);
            } else {
              console.error(`❌ Failed to push tag to ${remote}`);
              await LogService.append({
                command: 'tag',
                args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
                status: 'failure',
                details: `tag push to ${remote} failed`,
                model: mergedModel
              });
            }
          }
        }
      }
    }

    await LogService.append({
      command: 'tag',
      args: { name: trimmedName, ...options, apiKey: options.apiKey ? '***' : undefined },
      status: 'success',
      model: mergedModel
    });
  }

  private async selectRemotesForPush(tagName: string, remotes: string[]): Promise<string[] | null> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\nAvailable remotes:');
    remotes.forEach((remote, index) => {
      console.log(`  ${index + 1}. ${remote}`);
    });
    console.log(`  all. Push to all remotes`);
    console.log(`  n. Skip push`);

    const answer: string = await new Promise(resolve => {
      rl.question(`\nSelect remote(s) to push tag ${tagName} (e.g., 1 or 1,2 or all or n): `, resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();

    if (normalized === 'n' || normalized === 'no' || normalized === '') {
      return null;
    }

    if (normalized === 'all') {
      return remotes;
    }

    const selections = normalized.split(',').map(s => s.trim());
    const selectedRemotes: string[] = [];

    for (const sel of selections) {
      const index = parseInt(sel, 10);
      if (isNaN(index) || index < 1 || index > remotes.length) {
        console.log(`Invalid selection: ${sel}`);
        return null;
      }
      const remote = remotes[index - 1];
      if (!selectedRemotes.includes(remote)) {
        selectedRemotes.push(remote);
      }
    }

    return selectedRemotes.length > 0 ? selectedRemotes : null;
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
