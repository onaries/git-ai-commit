import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';

export type SupportedLanguage = 'ko' | 'en';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export type AIMode = 'custom' | 'openai' | 'gemini';

export interface EnvironmentConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  fallbackModel?: string;
  reasoningEffort?: ReasoningEffort;
  mode: AIMode;
  language: SupportedLanguage;
  autoPush: boolean;
  coAuthor?: string | false;
  maxCompletionTokens?: number;
}

interface StoredConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  fallbackModel?: string;
  reasoningEffort?: ReasoningEffort | string;
  mode?: AIMode;
  language?: SupportedLanguage | string;
  autoPush?: boolean;
  coAuthor?: string | false;
  maxCompletionTokens?: number;
}

const DEFAULT_MODEL = 'zai-org/GLM-4.5-FP8';
const DEFAULT_MODE: AIMode = 'custom';
const DEFAULT_LANGUAGE: SupportedLanguage = 'ko';
const DEFAULT_AUTO_PUSH = false;
const DEFAULT_CO_AUTHOR = 'git-ai-commit <git-ai-commit@users.noreply.github.com>';
const CONFIG_SCHEMA_URL = 'https://raw.githubusercontent.com/onaries/git-ai-commit/main/src/schema/config.schema.json';

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
      const { $schema, ...config } = typeof parsed === 'object' && parsed !== null ? parsed : {} as Record<string, unknown>;
      return config as StoredConfig;
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

  private static normalizeReasoningEffort(effort?: string): ReasoningEffort | undefined {
    if (!effort) return undefined;
    const normalized = effort.toLowerCase();
    if (['minimal', 'low', 'medium', 'high'].includes(normalized)) {
      return normalized as ReasoningEffort;
    }
    return undefined;
  }

  private static normalizeMode(mode?: string): AIMode {
    if (!mode) {
      return DEFAULT_MODE;
    }

    const normalized = mode.toLowerCase();
    if (normalized === 'openai') return 'openai';
    if (normalized === 'gemini') return 'gemini';
    return 'custom';
  }

  private static resolveEnvConfig(modeOverride?: AIMode): EnvironmentConfig {
    const resolvedMode = this.normalizeMode(modeOverride || process.env.AI_MODE);

    let apiKey: string | undefined;
    let baseURL: string | undefined;
    let model: string;

    if (resolvedMode === 'gemini') {
      apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
      baseURL = undefined;
      model = process.env.AI_MODEL || 'gemini-2.0-flash';
    } else if (resolvedMode === 'openai') {
      apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
      baseURL = process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL;
      model = process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
    } else {
      apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
      baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;
      model = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    }

    return {
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      model,
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
    const fallbackModel = fileConfig.fallbackModel;
    const reasoningEffort = this.normalizeReasoningEffort(fileConfig.reasoningEffort);
    const language = this.normalizeLanguage(fileConfig.language ?? envConfig.language);
    const autoPush = typeof fileConfig.autoPush === 'boolean' ? fileConfig.autoPush : envConfig.autoPush;
    const coAuthor = fileConfig.coAuthor === false ? false : (fileConfig.coAuthor || DEFAULT_CO_AUTHOR);
    const maxCompletionTokens = typeof fileConfig.maxCompletionTokens === 'number' && fileConfig.maxCompletionTokens > 0
      ? fileConfig.maxCompletionTokens
      : undefined;
    return {
      apiKey,
      baseURL,
      model,
      fallbackModel,
      reasoningEffort,
      mode,
      language,
      autoPush,
      coAuthor,
      maxCompletionTokens,
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

    // coAuthor: false means explicitly disabled — persist it so getConfig() sees it

    const sanitized = Object.entries(next).reduce<StoredConfig>((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key as keyof StoredConfig] = value as any;
      } else {
        delete acc[key as keyof StoredConfig];
      }
      return acc;
    }, {});

    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify({ $schema: CONFIG_SCHEMA_URL, ...sanitized }, null, 2), 'utf-8');
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
