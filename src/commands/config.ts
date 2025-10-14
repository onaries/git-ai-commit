import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';

export type SupportedLanguage = 'ko' | 'en';

export interface EnvironmentConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  mode: 'custom' | 'openai';
  language: SupportedLanguage;
  autoPush: boolean;
}

interface StoredConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  mode?: 'custom' | 'openai';
  language?: SupportedLanguage | string;
  autoPush?: boolean;
}

const DEFAULT_MODEL = 'zai-org/GLM-4.5-FP8';
const DEFAULT_MODE: 'custom' | 'openai' = 'custom';
const DEFAULT_LANGUAGE: SupportedLanguage = 'ko';
const DEFAULT_AUTO_PUSH = false;

export class ConfigService {
  private static getConfigFilePath(): string {
    const overridePath = process.env.GIT_AI_COMMIT_CONFIG_PATH;
    if (overridePath) {
      return path.resolve(overridePath);
    }

    return path.join(os.homedir(), '.git-ai-commit', 'config.json');
  }

  private static loadFileConfig(): StoredConfig {
    const filePath = this.getConfigFilePath();

    try {
      if (!fs.existsSync(filePath)) {
        return {};
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw.trim()) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (error) {
      console.warn('Warning: Failed to read configuration file. Falling back to environment variables.');
      return {};
    }
  }

  private static normalizeLanguage(language?: string): SupportedLanguage {
    if (!language) {
      return DEFAULT_LANGUAGE;
    }

    const normalized = language.toLowerCase();
    return normalized === 'en' ? 'en' : 'ko';
  }

  private static normalizeMode(mode?: string): 'custom' | 'openai' {
    if (!mode) {
      return DEFAULT_MODE;
    }

    const normalized = mode.toLowerCase();
    return normalized === 'openai' ? 'openai' : 'custom';
  }

  private static resolveEnvConfig(modeOverride?: 'custom' | 'openai'): EnvironmentConfig {
    const resolvedMode = this.normalizeMode(modeOverride || process.env.AI_MODE);
    const isOpenAI = resolvedMode === 'openai';

    const apiKey = isOpenAI
      ? process.env.OPENAI_API_KEY || process.env.AI_API_KEY
      : process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

    const baseURL = isOpenAI
      ? process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL
      : process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;

    const model = isOpenAI
      ? process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL
      : process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;

    return {
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      model: model || DEFAULT_MODEL,
      mode: resolvedMode,
      language: DEFAULT_LANGUAGE,
      autoPush: DEFAULT_AUTO_PUSH
    };
  }

  static getConfig(): EnvironmentConfig {
    const fileConfig = this.loadFileConfig();
    const envConfig = this.resolveEnvConfig(fileConfig.mode);

    const mode = this.normalizeMode(fileConfig.mode || envConfig.mode);
    const apiKey = fileConfig.apiKey ?? envConfig.apiKey;
    const baseURL = fileConfig.baseURL ?? envConfig.baseURL;
    const model = fileConfig.model ?? envConfig.model ?? DEFAULT_MODEL;
    const language = this.normalizeLanguage(fileConfig.language ?? envConfig.language);
    const autoPush = typeof fileConfig.autoPush === 'boolean' ? fileConfig.autoPush : envConfig.autoPush;

    return {
      apiKey,
      baseURL,
      model,
      mode,
      language,
      autoPush
    };
  }

  static getEnvConfig(): EnvironmentConfig {
    return this.getConfig();
  }

  static async updateConfig(updates: StoredConfig): Promise<void> {
    const filePath = this.getConfigFilePath();
    const current = this.loadFileConfig();

    const next: StoredConfig = {
      ...current,
      ...updates
    };

    if (updates.language !== undefined) {
      next.language = this.normalizeLanguage(updates.language);
    }

    if (updates.autoPush !== undefined) {
      next.autoPush = Boolean(updates.autoPush);
    }

    if (updates.mode !== undefined) {
      next.mode = this.normalizeMode(updates.mode);
    }

    if (next.model === DEFAULT_MODEL) {
      delete next.model;
    }

    if (next.mode === DEFAULT_MODE) {
      delete next.mode;
    }

    const sanitized = Object.entries(next).reduce<StoredConfig>((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key as keyof StoredConfig] = value as any;
      } else {
        delete acc[key as keyof StoredConfig];
      }
      return acc;
    }, {});

    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(sanitized, null, 2), 'utf-8');
  }

  static validateConfig(config: { apiKey?: string; language?: string }): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    if (config.language && !['ko', 'en'].includes(config.language)) {
      throw new Error('Unsupported language. Use "ko" or "en".');
    }
  }
}
