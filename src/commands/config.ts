export interface EnvironmentConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export class ConfigService {
  static getEnvConfig(): EnvironmentConfig {
    const apiKey = process.env.CHUTES_API_TOKEN || process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('API key is required. Set CHUTES_API_TOKEN, OPENAI_API_KEY, or AI_API_KEY environment variable.');
    }

    return {
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL,
      model: process.env.OPENAI_MODEL || process.env.AI_MODEL || 'zai-org/GLM-4.5-FP8'
    };
  }

  static validateConfig(config: EnvironmentConfig): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
  }
}