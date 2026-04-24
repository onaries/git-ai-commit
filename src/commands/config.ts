import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';

export type SupportedLanguage = 'ko' | 'en';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export type AIMode = 'custom' | 'openai' | 'gemini';
export type ProviderPriority = 'primary-first' | 'fallback-first';

export interface EnvironmentConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  fallbackModel?: string;
  fallbackMode?: AIMode;
  fallbackApiKey?: string;
  fallbackBaseURL?: string;
  providerPriority: ProviderPriority;
  reasoning?: boolean;
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
  fallbackMode?: AIMode;
  fallbackApiKey?: string;
  fallbackBaseURL?: string;
  providerPriority?: ProviderPriority | string;
  reasoning?: boolean | string;
  reasoningEffort?: ReasoningEffort | string;
  mode?: AIMode;
  language?: SupportedLanguage | string;
  autoPush?: boolean;
  coAuthor?: string | false;
  maxCompletionTokens?: number;
}

const DEFAULT_MODEL = 'zai-org/GLM-4.5-FP8';
const DEFAULT_MODE: AIMode = 'custom';
const DEFAULT_PROVIDER_PRIORITY: ProviderPriority = 'primary-first';
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
      const { ...config } = typeof parsed === 'object' && parsed !== null ? parsed : {} as Record<string, unknown>;
      return config as StoredConfig;
    } catch {
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

  private static normalizeOptionalMode(mode?: string): AIMode | undefined {
    if (!mode) {
      return undefined;
    }

    return this.normalizeMode(mode);
  }

  private static normalizeProviderPriority(priority?: string): ProviderPriority {
    if (!priority) {
      return DEFAULT_PROVIDER_PRIORITY;
    }

    const normalized = priority.toLowerCase();
    return normalized === 'fallback-first' ? 'fallback-first' : 'primary-first';
  }

  private static normalizeOptionalBoolean(value?: boolean | string): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.toLowerCase().trim();
    if (['true', '1', 'yes', 'on', 'enabled', 'enable'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off', 'disabled', 'disable'].includes(normalized)) {
      return false;
    }

    return undefined;
  }

  private static resolveEnvConfig(modeOverride?: AIMode): EnvironmentConfig {
    const resolvedMode = this.normalizeMode(modeOverride || process.env.AI_MODE);

    let apiKey: string | undefined;
    let baseURL: string | undefined;
    let model: string;
    let reasoning: boolean | undefined;

    if (resolvedMode === 'gemini') {
      apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
      baseURL = undefined;
      model = process.env.AI_MODEL || 'gemini-3-flash-preview';
      reasoning = this.normalizeOptionalBoolean(process.env.AI_REASONING);
    } else if (resolvedMode === 'openai') {
      apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
      baseURL = process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL;
      model = process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
      reasoning = this.normalizeOptionalBoolean(process.env.OPENAI_REASONING ?? process.env.AI_REASONING);
    } else {
      apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
      baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;
      model = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
      reasoning = this.normalizeOptionalBoolean(process.env.AI_REASONING ?? process.env.OPENAI_REASONING);
    }

    return {
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      model,
      providerPriority: DEFAULT_PROVIDER_PRIORITY,
      reasoning,
      mode: resolvedMode,
      language: DEFAULT_LANGUAGE,
      autoPush: DEFAULT_AUTO_PUSH
    };
  }

  static getConfig(): EnvironmentConfig {
    const fileConfig = this.loadFileConfig();
    const envConfig = this.resolveEnvConfig(fileConfig.mode);

    const mode = this.normalizeMode(fileConfig.mode || envConfig.mode);
    const providerPriority = this.normalizeProviderPriority(
      (fileConfig.providerPriority as string | undefined) || process.env.AI_PROVIDER_PRIORITY
    );
    const apiKey = fileConfig.apiKey ?? envConfig.apiKey;
    const baseURL = fileConfig.baseURL ?? envConfig.baseURL;
    const model = fileConfig.model ?? envConfig.model ?? DEFAULT_MODEL;
    const hasFallbackHints =
      fileConfig.fallbackModel !== undefined ||
      fileConfig.fallbackMode !== undefined ||
      fileConfig.fallbackApiKey !== undefined ||
      fileConfig.fallbackBaseURL !== undefined ||
      process.env.AI_FALLBACK_MODEL !== undefined ||
      process.env.AI_FALLBACK_MODE !== undefined ||
      process.env.AI_FALLBACK_API_KEY !== undefined ||
      process.env.AI_FALLBACK_BASE_URL !== undefined;
    const requestedFallbackMode = this.normalizeOptionalMode(fileConfig.fallbackMode || process.env.AI_FALLBACK_MODE);
    const fallbackMode = hasFallbackHints ? (requestedFallbackMode ?? mode) : undefined;
    const fallbackEnvConfig = fallbackMode ? this.resolveEnvConfig(fallbackMode) : undefined;
    const fallbackModel = hasFallbackHints
      ? fileConfig.fallbackModel
        ?? process.env.AI_FALLBACK_MODEL
        ?? fallbackEnvConfig?.model
      : undefined;
    const fallbackApiKey = hasFallbackHints
      ? fileConfig.fallbackApiKey
        ?? process.env.AI_FALLBACK_API_KEY
        ?? fallbackEnvConfig?.apiKey
      : undefined;
    const fallbackBaseURL = hasFallbackHints
      ? fileConfig.fallbackBaseURL
        ?? process.env.AI_FALLBACK_BASE_URL
        ?? fallbackEnvConfig?.baseURL
      : undefined;
    const reasoningEffort = this.normalizeReasoningEffort(fileConfig.reasoningEffort);
    const reasoning = this.normalizeOptionalBoolean(fileConfig.reasoning) ?? envConfig.reasoning;
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
      fallbackMode,
      fallbackApiKey,
      fallbackBaseURL,
      providerPriority,
      reasoning,
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

    if (updates.fallbackMode !== undefined) {
      next.fallbackMode = this.normalizeOptionalMode(updates.fallbackMode);
    }

    if (updates.providerPriority !== undefined) {
      next.providerPriority = this.normalizeProviderPriority(updates.providerPriority as string);
    }

    if (updates.reasoning !== undefined) {
      next.reasoning = this.normalizeOptionalBoolean(updates.reasoning);
    }

    if (next.model === DEFAULT_MODEL) {
      delete next.model;
    }

    if (next.mode === DEFAULT_MODE) {
      delete next.mode;
    }

    if (next.providerPriority === DEFAULT_PROVIDER_PRIORITY) {
      delete next.providerPriority;
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
