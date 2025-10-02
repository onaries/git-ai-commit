import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConfigService } from '../commands/config';

describe('ConfigService', () => {
  const originalEnv = process.env;
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      PATH: originalEnv.PATH,
      NODE_ENV: 'test'
    } as NodeJS.ProcessEnv;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ai-config-'));
    configPath = path.join(tempDir, 'config.json');
    process.env.GIT_AI_COMMIT_CONFIG_PATH = configPath;
    if (fs.existsSync(configPath)) {
      fs.rmSync(configPath, { force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      fs.rmSync(configPath, { force: true });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  describe('getConfig', () => {
    it('returns environment configuration using CHUTES_API_TOKEN', () => {
      process.env.CHUTES_API_TOKEN = 'chutes-api-key';
      process.env.OPENAI_BASE_URL = 'https://api.test.com';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'chutes-api-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4',
        mode: 'custom',
        language: 'ko',
        autoPush: false
      });
    });

    it('uses OPENAI_API_KEY values when present', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.OPENAI_BASE_URL = 'https://api.test.com';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4',
        mode: 'custom',
        language: 'ko',
        autoPush: false
      });
    });

    it('falls back to AI_API_KEY when others are missing', () => {
      process.env.AI_API_KEY = 'fallback-api-key';
      process.env.AI_BASE_URL = 'https://fallback.test.com';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'fallback-api-key',
        baseURL: 'https://fallback.test.com',
        model: 'claude-3',
        mode: 'custom',
        language: 'ko',
        autoPush: false
      });
    });

    it('prefers AI_* variables over others in custom mode', () => {
      process.env.AI_API_KEY = 'ai-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.CHUTES_API_TOKEN = 'chutes-key';
      process.env.AI_BASE_URL = 'ai-url';
      process.env.OPENAI_BASE_URL = 'openai-url';

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'ai-key',
        baseURL: 'ai-url',
        model: 'zai-org/GLM-4.5-FP8',
        mode: 'custom',
        language: 'ko',
        autoPush: false
      });
    });

    it('uses OPENAI_* variables when mode is openai', () => {
      process.env.AI_MODE = 'openai';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.AI_API_KEY = 'ai-key';
      process.env.OPENAI_BASE_URL = 'openai-url';
      process.env.AI_BASE_URL = 'ai-url';
      process.env.OPENAI_MODEL = 'gpt-4';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'openai-key',
        baseURL: 'openai-url',
        model: 'gpt-4',
        mode: 'openai',
        language: 'ko',
        autoPush: false
      });
    });

    it('falls back to AI_* variables in openai mode when OPENAI_* missing', () => {
      process.env.AI_MODE = 'openai';
      process.env.AI_API_KEY = 'ai-key';
      process.env.AI_BASE_URL = 'ai-url';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'ai-key',
        baseURL: 'ai-url',
        model: 'claude-3',
        mode: 'openai',
        language: 'ko',
        autoPush: false
      });
    });

    it('uses default model when none provided', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_MODEL;
      delete process.env.AI_MODEL;

      const config = ConfigService.getConfig();

      expect(config.model).toBe('zai-org/GLM-4.5-FP8');
      expect(config.mode).toBe('custom');
    });

    it('allows configuration file to override environment values', async () => {
      process.env.AI_API_KEY = 'env-key';
      process.env.AI_BASE_URL = 'https://env.example';
      process.env.AI_MODEL = 'env-model';

      await ConfigService.updateConfig({
        apiKey: 'file-key',
        baseURL: 'https://file.example',
        model: 'file-model',
        language: 'en',
        autoPush: true
      });

      const config = ConfigService.getConfig();

      expect(config).toEqual({
        apiKey: 'file-key',
        baseURL: 'https://file.example',
        model: 'file-model',
        mode: 'custom',
        language: 'en',
        autoPush: true
      });
    });
  });

  describe('validateConfig', () => {
    it('does not throw for valid configuration', () => {
      const config = {
        apiKey: 'test-key',
        language: 'ko'
      };

      expect(() => ConfigService.validateConfig(config)).not.toThrow();
    });

    it('throws when API key is missing', () => {
      const config = {
        apiKey: '',
        language: 'en'
      };

      expect(() => ConfigService.validateConfig(config)).toThrow('API key is required');
    });

    it('throws when language is invalid', () => {
      const config = {
        apiKey: 'test',
        language: 'jp'
      } as any;

      expect(() => ConfigService.validateConfig(config)).toThrow('Unsupported language. Use "ko" or "en".');
    });

    it('throws when merged configuration lacks API key', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.AI_API_KEY;
      delete process.env.CHUTES_API_TOKEN;

      const config = ConfigService.getConfig();

      expect(() => ConfigService.validateConfig(config)).toThrow('API key is required');
    });
  });
});
