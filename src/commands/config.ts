export interface EnvironmentConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  mode?: 'custom' | 'openai';
}

export class ConfigService {
  static getEnvConfig(): EnvironmentConfig {
    const mode = (process.env.AI_MODE || 'custom').toLowerCase() as 'custom' | 'openai';
    const isOpenAI = mode === 'openai';

    const apiKey = isOpenAI
      ? process.env.OPENAI_API_KEY || process.env.AI_API_KEY || process.env.CHUTES_API_TOKEN
      : process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.CHUTES_API_TOKEN;

    if (!apiKey) {
      const message = isOpenAI
        ? 'API key is required. Set OPENAI_API_KEY, AI_API_KEY, or CHUTES_API_TOKEN environment variable.'
        : 'API key is required. Set AI_API_KEY, OPENAI_API_KEY, or CHUTES_API_TOKEN environment variable.';
      throw new Error(message);
    }

    return {
      apiKey,
      baseURL: isOpenAI
        ? process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL
        : process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL,
      model: isOpenAI
        ? process.env.OPENAI_MODEL || process.env.AI_MODEL || 'zai-org/GLM-4.5-FP8'
        : process.env.AI_MODEL || process.env.OPENAI_MODEL || 'zai-org/GLM-4.5-FP8',
      mode
    };
  }

  static validateConfig(config: EnvironmentConfig): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
  }
}
