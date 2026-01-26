import { Command } from 'commander';
import { ConfigService, SupportedLanguage } from './config';

export interface ConfigOptions {
  show?: boolean;
  language?: string;
  autoPush?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fallbackModel?: string;
  reasoningEffort?: string;
  mode?: 'custom' | 'openai';
}

export class ConfigCommand {
  private program: Command;

  constructor() {
    this.program = new Command('config')
      .description('Manage git-ai-commit configuration')
      .option('-s, --show', 'Show current configuration values')
      .option('-l, --language <language>', 'Set default language for AI output (ko | en)')
      .option('--auto-push', 'Enable automatic git push after successful commits created with --commit')
      .option('--no-auto-push', 'Disable automatic git push after successful commits created with --commit')
      .option('-k, --api-key <key>', 'Persist API key for AI requests (overrides environment variables)')
      .option('-b, --base-url <url>', 'Persist API base URL (overrides environment variables)')
      .option('-m, --model <model>', 'Persist default AI model')
      .option('--fallback-model <model>', 'Persist fallback model for rate limit (429) retry')
      .option('--reasoning-effort <level>', 'Thinking effort for reasoning models (minimal | low | medium | high)')
      .option('--mode <mode>', 'Persist AI mode (custom | openai)')
      .action(this.handleConfig.bind(this));
  }

  private validateLanguage(language: string): SupportedLanguage {
    const normalized = language?.toLowerCase();
    if (normalized !== 'ko' && normalized !== 'en') {
      console.error('Language must be either "ko" or "en".');
      process.exit(1);
    }

    return normalized;
  }

  private validateMode(mode: string): 'custom' | 'openai' {
    const normalized = mode?.toLowerCase();
    if (normalized !== 'custom' && normalized !== 'openai') {
      console.error('Mode must be either "custom" or "openai".');
      process.exit(1);
    }

    return normalized;
  }

  private sanitizeStringValue(value?: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async handleConfig(options: ConfigOptions) {
    const updates: {
      apiKey?: string;
      baseURL?: string;
      model?: string;
      fallbackModel?: string;
      reasoningEffort?: string;
      mode?: 'custom' | 'openai';
      language?: SupportedLanguage;
      autoPush?: boolean;
    } = {};

    if (options.language) {
      updates.language = this.validateLanguage(options.language);
    }

    if (typeof options.autoPush === 'boolean') {
      updates.autoPush = options.autoPush;
    }

    if (options.apiKey !== undefined) {
      updates.apiKey = this.sanitizeStringValue(options.apiKey);
    }

    if (options.baseUrl !== undefined) {
      updates.baseURL = this.sanitizeStringValue(options.baseUrl);
    }

    if (options.model !== undefined) {
      updates.model = this.sanitizeStringValue(options.model);
    }

    if (options.fallbackModel !== undefined) {
      updates.fallbackModel = this.sanitizeStringValue(options.fallbackModel);
    }

    if (options.reasoningEffort !== undefined) {
      const effort = options.reasoningEffort.toLowerCase();
      if (!['minimal', 'low', 'medium', 'high'].includes(effort)) {
        console.error('Reasoning effort must be one of: minimal, low, medium, high');
        process.exit(1);
      }
      updates.reasoningEffort = effort;
    }

    if (options.mode) {
      updates.mode = this.validateMode(options.mode);
    }

    const hasUpdates = Object.keys(updates).length > 0;

    if (!options.show && !hasUpdates) {
      console.log('Usage examples:');
      console.log('  git-ai-commit config --show                 # Display merged configuration');
      console.log('  git-ai-commit config --language en          # Use English prompts and output');
      console.log('  git-ai-commit config --auto-push            # Push after commits created with --commit');
      console.log('  git-ai-commit config -k sk-xxx              # Persist API key securely on disk');
      console.log('  git-ai-commit config -b https://api.test    # Persist custom API base URL');
      console.log('  git-ai-commit config --mode openai          # Use OpenAI-compatible environment defaults');
      console.log('  git-ai-commit config --model gpt-4o-mini    # Persist preferred AI model');
      console.log('  git-ai-commit config --fallback-model glm-4-flash  # Fallback model for 429 retry');
      return;
    }

    if (hasUpdates) {
      try {
        await ConfigService.updateConfig(updates);
        console.log('Configuration updated successfully.');
      } catch (error) {
        console.error('Error updating configuration:', error instanceof Error ? error.message : error);
        process.exit(1);
        return;
      }
    }

    if (options.show) {
      try {
        const config = ConfigService.getConfig();
        console.log('Current configuration:');
        console.log(`Language: ${config.language}`);
        console.log(`Auto push: ${config.autoPush ? 'enabled' : 'disabled'}`);
        console.log(`API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'Not set'}`);
        console.log(`Base URL: ${config.baseURL || 'Not set (using provider default)'}`);
        console.log(`Model: ${config.model || 'zai-org/GLM-4.5-FP8 (default)'}`);
        console.log(`Fallback Model: ${config.fallbackModel || 'Not set'}`);
        console.log(`Reasoning Effort: ${config.reasoningEffort || 'Not set (model default)'}`);
        console.log(`Mode: ${config.mode || 'custom (default)'}`);
      } catch (error) {
        console.error('Error reading configuration:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  }

  getCommand(): Command {
    return this.program;
  }
}
