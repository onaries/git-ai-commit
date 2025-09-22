import { ConfigService } from '../commands/config';

describe('ConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvConfig', () => {
    it('should return config with CHUTES_API_TOKEN', () => {
      process.env.CHUTES_API_TOKEN = 'chutes-api-key';
      process.env.OPENAI_BASE_URL = 'https://api.test.com';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'chutes-api-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4',
        mode: 'custom'
      });
    });

    it('should return config with OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.OPENAI_BASE_URL = 'https://api.test.com';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4',
        mode: 'custom'
      });
    });

    it('should return config with AI_API_KEY fallback', () => {
      process.env.AI_API_KEY = 'fallback-api-key';
      process.env.AI_BASE_URL = 'https://fallback.test.com';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'fallback-api-key',
        baseURL: 'https://fallback.test.com',
        model: 'claude-3',
        mode: 'custom'
      });
    });

    it('should prefer AI variables over others in custom mode', () => {
      process.env.AI_API_KEY = 'ai-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.CHUTES_API_TOKEN = 'chutes-key';
      process.env.AI_BASE_URL = 'ai-url';
      process.env.OPENAI_BASE_URL = 'openai-url';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'ai-key',
        baseURL: 'ai-url',
        model: 'zai-org/GLM-4.5-FP8',
        mode: 'custom'
      });
    });

    it('should use OPENAI variables when mode is openai', () => {
      process.env.AI_MODE = 'openai';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.AI_API_KEY = 'ai-key';
      process.env.OPENAI_BASE_URL = 'openai-url';
      process.env.AI_BASE_URL = 'ai-url';
      process.env.OPENAI_MODEL = 'gpt-4';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'openai-key',
        baseURL: 'openai-url',
        model: 'gpt-4',
        mode: 'openai'
      });
    });

    it('should fallback to AI variables in openai mode when OPENAI values missing', () => {
      process.env.AI_MODE = 'openai';
      process.env.AI_API_KEY = 'ai-key';
      process.env.AI_BASE_URL = 'ai-url';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'ai-key',
        baseURL: 'ai-url',
        model: 'claude-3',
        mode: 'openai'
      });
    });

    it('should use default model when not specified', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_MODEL;
      delete process.env.AI_MODEL;

      const config = ConfigService.getEnvConfig();

      expect(config.model).toBe('zai-org/GLM-4.5-FP8');
      expect(config.mode).toBe('custom');
    });

    it('should throw error when no API key is provided', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.AI_API_KEY;
      delete process.env.CHUTES_API_TOKEN;

      expect(() => ConfigService.getEnvConfig()).toThrow('API key is required');
    });
  });

  describe('validateConfig', () => {
    it('should not throw for valid config', () => {
      const config = {
        apiKey: 'test-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      };

      expect(() => ConfigService.validateConfig(config)).not.toThrow();
    });

    it('should throw error when API key is missing', () => {
      const config = {
        apiKey: '',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      };

      expect(() => ConfigService.validateConfig(config)).toThrow('API key is required');
    });

    it('should throw error when API key is undefined', () => {
      const config = {
        apiKey: '',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      } as any;

      expect(() => ConfigService.validateConfig(config)).toThrow('API key is required');
    });
  });
});
