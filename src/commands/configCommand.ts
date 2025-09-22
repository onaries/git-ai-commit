import { Command } from 'commander';
import { ConfigService } from './config';

export interface ConfigOptions {
  show?: boolean;
}

export class ConfigCommand {
  private program: Command;

  constructor() {
    this.program = new Command('config')
      .description('Manage configuration')
      .option('-s, --show', 'Show current configuration')
      .action(this.handleConfig.bind(this));
  }

  private async handleConfig(options: ConfigOptions) {
    if (options.show) {
      try {
        const config = ConfigService.getEnvConfig();
        console.log('Current configuration:');
        console.log(`API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'Not set'}`);
        console.log(`Base URL: ${config.baseURL || 'Not set (using OpenAI default)'}`);
        console.log(`Model: ${config.model || 'zai-org/GLM-4.5-FP8 (default)'}`);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else {
      console.log('Usage:');
      console.log('  Set environment variables:');
      console.log('    export CHUTES_API_TOKEN=your_api_key');
      console.log('    export OPENAI_BASE_URL=your_base_url  # Optional');
      console.log('    export OPENAI_MODEL=your_model        # Optional');
      console.log('');
      console.log('  Or use:');
      console.log('    export OPENAI_API_KEY=your_api_key');
      console.log('    export OPENAI_BASE_URL=your_base_url  # Optional');
      console.log('    export OPENAI_MODEL=your_model        # Optional');
      console.log('    export AI_API_KEY=your_api_key');
      console.log('    export AI_BASE_URL=your_base_url      # Optional');
      console.log('    export AI_MODEL=your_model           # Optional');
      console.log('');
      console.log('  Show current config:');
      console.log('    git-ai-commit config --show');
    }
  }

  getCommand(): Command {
    return this.program;
  }
}